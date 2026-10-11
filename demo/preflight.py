"""
AnkiBrain demo pipeline — preflight, settings generation, manifest reporting.

Stdlib only at import time: this file is invoked both by the system python
(--list / --pass / --summary) and by the Anki venv python (--create-profile,
which imports aqt).

Subcommands
    --list SHOTS_JSON
    --create-profile BASE NAME        (Anki venv python: needs aqt)
    --pass NAME --repo R --base B --shots S
    --probe-report PROBE_DIR CONFIG_JSON
    --summary MANIFEST_JSON SHOTS_JSON
"""

import argparse
import json
import os
import sys
from os import path

PASS_MODES = {'main': 'LOCAL'}

# Settings the generated demo file sets explicitly. Everything else falls back
# to settings.py's defaults when the app boots.
BASE_OVERRIDES = {
    'colorMode': 'dark',
    'showSidePanel': True,
    'showBootReminderDialog': False,
    'showCardBottomHint': True,
    'tempCards': [],
    'documents_saved': [],
    'devMode': False,
    'deleteCardsAfterAdding': True,
    # Keeps SettingsManager from clearing documents_saved on every boot (that
    # branch exists to migrate legacy API-embedded vectors).
    'localEmbeddingBackend': 'onnx-minilm-l6-v2',
    'ttsEnabled': True,
    'ttsAutoDetect': True,
    'ttsCardAudioMode': 'none',
}

ENDPOINT_TIMEOUT = 25


def read_json(pth, default=None):
    try:
        with open(pth, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json(pth, data):
    os.makedirs(path.dirname(pth), exist_ok=True)
    with open(pth, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write('\n')


def read_env_key(env_path):
    """OPENAI_API_KEY out of a dotenv file, without importing dotenv."""
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, value = line.partition('=')
                if key.strip() == 'OPENAI_API_KEY':
                    return value.strip().strip('"').strip("'")
    except FileNotFoundError:
        return ''
    return ''


def endpoint_probe(base_url, api_key, headers):
    """GET <base>/models. Reimplements networking.check_openai_endpoint for the
    world outside Anki, using the same headers the app sends."""
    import urllib.error
    import urllib.request

    base = (base_url or '').strip().rstrip('/') or 'https://api.openai.com/v1'
    url = f'{base}/models'
    request = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=ENDPOINT_TIMEOUT) as response:
            code = response.status
            body = response.read()
    except urllib.error.HTTPError as exc:
        code = exc.code
        body = exc.read() if hasattr(exc, 'read') else b''
    except Exception as exc:
        return {'ok': False, 'url': url, 'status': None, 'models': [],
                'message': f'Could not reach {url}: {exc}'}

    models = []
    try:
        payload = json.loads(body.decode('utf-8', 'replace'))
        models = sorted({m['id'] for m in payload.get('data', [])
                         if isinstance(m, dict) and isinstance(m.get('id'), str)})
    except Exception:
        payload = None

    if code == 200:
        message = f'Reachable (HTTP 200) - {len(models)} models listed.'
        key_ok = True
    else:
        message = _error_message(payload, body, code)
        key_ok = False
    return {'ok': True, 'url': url, 'status': code, 'models': models,
            'message': message, 'key_ok': key_ok}


def _error_message(payload, body, code):
    text = None
    if isinstance(payload, dict):
        err = payload.get('error')
        if isinstance(err, dict):
            text = err.get('message')
        elif isinstance(err, str):
            text = err
    if not text:
        text = body.decode('utf-8', 'replace')[:200]
    return f'HTTP {code} - {text}'


def build_settings(repo_settings, pass_name, version):
    """The settings.json the demo base boots with for one pass."""
    mode = PASS_MODES[pass_name]
    model = repo_settings.get('llmModel') or 'gpt-5.6-luna'
    models = repo_settings.get('openaiModels') or [model]
    settings = {
        **BASE_OVERRIDES,
        'user_mode': mode,
        'openaiBaseUrl': repo_settings.get('openaiBaseUrl') or '',
        'openaiExtraHeaders': repo_settings.get('openaiExtraHeaders') or {},
        'openaiSessionId': repo_settings.get('openaiSessionId') or '',
        'llmModel': model,
        'temperature': repo_settings.get('temperature', 0),
        'aiLanguage': repo_settings.get('aiLanguage') or 'English',
        'ttsVoice': repo_settings.get('ttsVoice') or 'af_heart',
        'ttsSpeed': repo_settings.get('ttsSpeed', 1.0),
        # Deliberately NOT verified here: the driver's own preflight runs the
        # app's check_openai_endpoint and persists the verdict, so the panel's
        # LOCAL-config gate is opened by the app's own code path.
        'openaiVerifiedUrl': None,
        'openaiKeyStatus': '',
        'openaiKeyStatusMessage': '',
        'openaiUrlStatusMessage': '',
        'openaiModels': list(models),
        'currentVersion': version,
    }
    return settings


def cmd_list(args):
    shots = read_json(args.shots, default=None)
    if shots is None:
        print(f'error: no shot registry at {args.shots}', file=sys.stderr)
        return 1
    for shot in sorted(shots['shots'], key=lambda s: (s['order'], s['id'])):
        tags = ','.join(shot.get('tags') or []) or '-'
        print(f"{shot['order']:02d}  {shot['id']:<32} {shot['title']}  "
              f"[{shot.get('pass', 'main')} | {tags}]")
    return 0


def cmd_create_profile(args):
    from pathlib import Path

    from aqt.profiles import ProfileManager

    manager = ProfileManager(Path(args.base))
    manager.setupMeta()
    manager.create(args.name)
    if args.name not in manager.profiles():
        print(f'error: profile {args.name!r} missing after create '
              f'(have {manager.profiles()})', file=sys.stderr)
        return 1
    print(f'profile {args.name!r} ready in {args.base} '
          f'(profiles: {", ".join(manager.profiles())})')
    return 0


def check_registry(repo, shots_path):
    """Every step a shot names must exist, before Anki is started.

    The driver resolves panel steps by file and Anki steps by attribute, so a
    typo or a deleted file would otherwise surface as a crash inside a live
    capture pass."""
    registry = read_json(shots_path, default=None)
    if registry is None:
        return [f'cannot read the shot registry at {shots_path}']
    steps_dir = path.join(repo, 'demo', 'steps', 'panel')
    anki_source = ''
    anki_path = path.join(repo, 'demo', 'addon', 'steps.py')
    if path.isfile(anki_path):
        anki_source = open(anki_path, encoding='utf-8').read()
    problems = []
    for shot in registry.get('shots', []):
        panel = set(shot.get('panel') or [])
        panel.update(shot.get('panel_after') or [])
        anki = set((spec.split(':')[0] for spec in (shot.get('anki') or [])))
        anki.update(spec.split(':')[0] for spec in (shot.get('anki_after') or []))
        for stage in shot.get('stages') or []:
            panel.update(stage.get('panel') or [])
            anki.update(spec.split(':')[0] for spec in (stage.get('anki') or []))
        for relative in sorted(panel):
            if not path.isfile(path.join(steps_dir, relative)):
                problems.append(f"{shot['id']}: no panel step {relative}")
        for name in sorted(anki):
            if f'def {name}(driver, arg)' not in anki_source:
                problems.append(f"{shot['id']}: no Anki step {name}")
    return problems


def cmd_pass(args):
    problems = check_registry(args.repo, args.shots)
    if problems:
        for problem in problems:
            print(f'error: {problem}', file=sys.stderr)
        return 1
    repo_settings = read_json(path.join(args.repo, 'user_files', 'settings.json'), default={})
    version = open(path.join(args.repo, '.ankibrain-version')).read().strip()
    api_key = read_env_key(path.join(args.repo, 'user_files', '.env'))
    base_url = repo_settings.get('openaiBaseUrl') or ''
    headers = {
        'User-Agent': f'AnkiBrain/{version}',
        'Authorization': f'Bearer {api_key}' if api_key else '',
    }
    session_id = (repo_settings.get('openaiSessionId') or '').strip()
    if session_id:
        headers['x-opencode-session'] = session_id
    for key, value in (repo_settings.get('openaiExtraHeaders') or {}).items():
        headers[str(key)] = str(value)
    headers = {k: v for k, v in headers.items() if v}

    if args.pass_name == 'main':
        if not api_key:
            print('error: no OPENAI_API_KEY in user_files/.env', file=sys.stderr)
            return 1
        result = endpoint_probe(base_url, api_key, headers)
        print(f"    endpoint {result['url']}: {result['message']}")
        if not result['ok'] or not result.get('key_ok'):
            print('error: the demo endpoint/key check failed; not starting Anki.',
                  file=sys.stderr)
            return 1
    else:
        result = {'models': []}

    settings = build_settings(repo_settings, args.pass_name, version)
    target = path.join(args.base, 'addons21', 'AnkiBrain', 'user_files', 'settings.json')
    write_json(target, settings)
    print(f'    settings written for pass {args.pass_name!r} '
          f"(user_mode={settings['user_mode']!r}, llmModel={settings['llmModel']!r}, "
          f'models={len(settings["openaiModels"])})')
    return 0


def cmd_probe_report(args):
    """Turn the driver's probe report into a config.json verdict."""
    report = read_json(path.join(args.probe_dir, 'report.json'), default=None)
    if report is None:
        print(f'error: no probe report in {args.probe_dir}', file=sys.stderr)
        return 1
    config = read_json(args.config, default={'capture_backend': 'auto'})
    print(json.dumps(report, indent=2))
    for backend in ('x11', 'grab'):
        entry = report.get('crops', {}).get(backend, {})
        verdict = 'rendered' if entry.get('colors', 0) >= 40 else 'FLAT'
        print(f"    {backend:<5} crop: {entry.get('size')} "
              f"{entry.get('colors')} distinct colors -> {verdict}")
    winner = report.get('winner')
    if not winner:
        print('error: neither backend produced a rendered panel crop; '
              'implement the CDP contingency before continuing.', file=sys.stderr)
        return 1
    config['capture_backend'] = winner
    write_json(args.config, config)
    print(f'    recorded capture_backend={winner!r} in {args.config}')
    return 0


def cmd_summary(args):
    manifest = read_json(args.manifest, default=None)
    shots = read_json(args.shots, default=None)
    if manifest is None or shots is None:
        print(f'error: missing manifest ({args.manifest}) or registry', file=sys.stderr)
        return 1
    entries = manifest.get('shots', {})
    passes = manifest.get('passes') or {}
    # Only judge what this run attempted: the manifest records the selected ids
    # per pass, so a `--pass setup` / `--only <id>` run is not reported as a
    # full run with missing shots.
    covered = {name for name, info in passes.items()} or \
        {entry.get('pass') for entry in entries.values()}
    failures = []
    skipped = []
    judged = 0
    for shot in sorted(shots['shots'], key=lambda s: (s['order'], s['id'])):
        pass_name = shot.get('pass', 'main')
        if pass_name not in covered:
            continue
        selected = (passes.get(pass_name) or {}).get('selected')
        if selected is not None and shot['id'] not in selected:
            continue
        judged += 1
        entry = entries.get(shot['id'])
        if entry is None:
            failures.append((shot['id'], 'no manifest entry'))
        elif entry.get('skipped'):
            # A skipped shot is a pass (its environment tag was unmet, or the
            # state it needs was not reachable) but never a silent success.
            skipped.append((shot['id'], entry.get('reason', '')))
        elif not entry.get('ok'):
            failures.append((shot['id'], entry.get('error', '')))
    print(f"==> {judged} shots in {len(covered)} pass(es) recorded in {args.manifest}: "
          f"{judged - len(failures) - len(skipped)} ok, "
          f"{len(skipped)} skipped, {len(failures)} failed")
    for shot_id, reason in skipped:
        print(f'    skipped {shot_id}: {reason}')
    for shot_id, reason in failures:
        print(f'    FAILED  {shot_id}: {reason}')
    return 1 if failures else 0


def main(argv=None):
    parser = argparse.ArgumentParser(prog='preflight.py', description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--list', nargs=1, metavar=('SHOTS_JSON',))
    group.add_argument('--create-profile', nargs=2, metavar=('BASE', 'NAME'))
    group.add_argument('--pass', nargs=1, dest='pass_name', metavar=('PASS_NAME',))
    group.add_argument('--probe-report', nargs=2, metavar=('PROBE_DIR', 'CONFIG_JSON'))
    group.add_argument('--summary', nargs=2, metavar=('MANIFEST_JSON', 'SHOTS_JSON'))
    parser.add_argument('--repo')
    parser.add_argument('--base')
    parser.add_argument('--shots')
    args = parser.parse_args(argv)

    if args.list:
        return cmd_list(argparse.Namespace(shots=args.list[0]))
    if args.create_profile:
        return cmd_create_profile(argparse.Namespace(base=args.create_profile[0],
                                                    name=args.create_profile[1]))
    if args.pass_name:
        missing = [name for name in ('repo', 'base') if not getattr(args, name)]
        if missing:
            parser.error('--pass needs ' + ', '.join('--' + name for name in missing))
        return cmd_pass(argparse.Namespace(pass_name=args.pass_name[0], repo=args.repo,
                                           base=args.base, shots=args.shots))
    if args.probe_report:
        return cmd_probe_report(argparse.Namespace(probe_dir=args.probe_report[0],
                                                   config=args.probe_report[1]))
    if args.summary:
        return cmd_summary(argparse.Namespace(manifest=args.summary[0],
                                              shots=args.summary[1]))
    return 2


if __name__ == '__main__':
    sys.exit(main())

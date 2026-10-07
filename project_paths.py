from os import path

root_project_dir = path.abspath(path.dirname(__file__))
user_data_dir = path.join(root_project_dir, 'user_files')
settings_path = path.join(user_data_dir, 'settings.json')
ChatAI_module_dir = path.join(root_project_dir, 'ChatAI')
dotenv_path = path.join(user_data_dir, '.env')
version_file_path = path.join(root_project_dir, '.ankibrain-version')
bundled_deps_dor = path.join(user_data_dir, 'bundled_dependencies')

def is_dev_checkout():
    """
    True when running from the source repository rather than a packaged
    .ankiaddon install. package-addon.sh strips .git/ and webview/ (only
    re-adding webview/dist), so neither marker exists for end users.
    """
    return (
        path.isdir(path.join(root_project_dir, 'webview', 'src'))
        or path.isdir(path.join(root_project_dir, '.git'))
    )

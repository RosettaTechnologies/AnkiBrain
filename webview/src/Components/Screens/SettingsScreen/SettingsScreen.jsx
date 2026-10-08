import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Popover,
  PopoverAnchor,
  PopoverBody,
  PopoverContent,
  Portal,
  Select,
  Switch,
  Tab,
  TabList,
  Textarea,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Text,
} from "@chakra-ui/react";
import "./SettingsScreen.css";
import { errorToast, infoToast, successToast } from "../../../api/toast";
import { setLLMModel, setTemperature } from "../../../api/settings";
import { setShowCardBottomHint as setStoreShowCardBottomHint } from "../../../api/redux/slices/showCardBottomHint";
import { setShowSidePanel as setStoreShowSidePanel } from "../../../api/redux/slices/showSidePanel";
import { useDispatch, useSelector } from "react-redux";
import { isLocalMode } from "../../../api/user";
import { setDevMode } from "../../../api/redux/slices/devMode";
import { setupServerAPI } from "../../../api/server-api/networking";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";
import React, { useState } from "react";
import {
  postPasswordReset,
  postRequestPasswordResetCode,
} from "../../../api/server-api/networking/user";
import { BiDonateHeart } from "react-icons/bi";
import { MdLanguage, MdOutlineRateReview } from "react-icons/md";
import { BsLayoutTextWindowReverse, BsPaletteFill } from "react-icons/bs";
import { RiLockPasswordFill } from "react-icons/ri";
import { setLanguage } from "../../../api/redux/slices/language";
import { store } from "../../../api/redux";
import { setDeleteCardsAfterAdding } from "../../../api/redux/slices/deleteCardsAfterAdding";
import { setShowBootReminderDialog } from "../../../api/redux/slices/showBootReminderDialog";
import { Slider, SliderTrack, SliderFilledTrack, SliderThumb } from "@chakra-ui/react";
import { useEffect } from "react";
import { openSetupModal, refreshTtsStatus, speak } from "../../../api/tts";
import { pyTtsUninstall } from "../../../api/PythonBridge/senders/pyTtsUninstall";
import { editTtsSettingLocal } from "../../../api/redux/slices/tts";
import {
  openLocalEngineModal,
  refreshLocalEngineStatus,
} from "../../../api/localEngine";
import {
  pyLocalEngineResetData,
  pyLocalEngineUninstall,
} from "../../../api/PythonBridge/senders/pyLocalEngine";
import {
  pySetOpenAIConfig,
  pyTestOpenAIConnection,
} from "../../../api/PythonBridge/senders/pyOpenAIConfig";
import {
  OPENAI_BASE_URL_PRESET_GROUPS,
  headersToText,
  parseHeadersText,
} from "../../../api/openai";
import {
  setHasOpenaiApiKey,
  setOpenAIBaseUrl,
  setOpenAIExtraHeaders,
  setOpenAIModels,
  setOpenAIInputCostPer1M,
  setOpenAIOutputCostPer1M,
} from "../../../api/redux/slices/appSettings";
import { pySetUserMode } from "../../../api/PythonBridge/senders/pySetUserMode";
import { setUserMode } from "../../../api/redux/slices/userMode";
import { setUserModeSelectorOpen } from "../../../api/redux/slices/userModeSelector";
import { pyRestartAnki } from "../../../api/PythonBridge/senders/pyRestartAnki";

/**
 * User-mode switch, available in both modes. One click apart with no Anki
 * restart: python persists the choice and restarts its async members
 * in-process, so the app immediately re-enters SERVER's auth gate or LOCAL's
 * engine gate. Switching to Local opens the shared mode selector (same surface
 * as first launch and the auth/engine gates' "switch mode"), which repeats the
 * costs before anything is downloaded.
 */
const UserModeSettings = () => {
  const dispatch = useDispatch();
  const userMode = useSelector((state) => state.userMode.value);
  const [busy, setBusy] = useState(false);

  const selectUserMode = async (mode) => {
    setBusy(true);
    try {
      const res = await pySetUserMode(mode);
      if (res && res.ok) {
        dispatch(setUserMode(mode));
      } else {
        errorToast("Could not switch mode", String((res && res.error) || ""));
      }
    } catch (e) {
      errorToast(
        "Could not switch mode",
        String((e && e.message) || e).slice(0, 300)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction={"column"} mt={5} width={325}>
      <Divider />
      <Flex direction={"row"} alignItems={"center"} mt={3} mb={2}>
        <i
          className={"bi bi-signpost-split-fill"}
          style={{ fontSize: 22, marginRight: 10 }}
        />
        <Text fontWeight={"bold"}>Mode</Text>
      </Flex>
      <Flex direction={"column"} mb={3}>
        <Text>
          Current mode:{" "}
          {userMode === "LOCAL"
            ? "Local (the AI runs on this computer)"
            : "Regular (AnkiBrain's servers run the AI)"}
        </Text>
      </Flex>

      {userMode === "LOCAL" ? (
        <Button
          width={325}
          height={"auto"}
          py={3}
          px={4}
          whiteSpace={"normal"}
          textAlign={"left"}
          variant={"accent"}
          isDisabled={busy}
          onClick={() => selectUserMode("SERVER")}
        >
          <Flex direction={"column"} align={"flex-start"}>
            <Text fontWeight={"bold"} fontSize={"md"} m={0}>
              Switch to regular mode
            </Text>
            <Text fontSize={12} m={0} mt={1} opacity={0.9}>
              Recommended if having issues
            </Text>
          </Flex>
        </Button>
      ) : (
        <Button
          width={325}
          mb={2}
          variant={"outline"}
          isDisabled={busy}
          onClick={() => dispatch(setUserModeSelectorOpen(true))}
        >
          Use Local mode (advanced)
        </Button>
      )}
      <Divider mt={3} />
    </Flex>
  );
};

const VoiceSettings = (props) => {
  const dispatch = useDispatch();
  const tts = useSelector((state) => state.tts);
  const settings = tts.settings;
  const status = tts.status;

  useEffect(() => {
    refreshTtsStatus();
  }, []);

  const setTts = async (key, value) => {
    dispatch(editTtsSettingLocal({ key, value }));
    await pyEditSetting(key, value);
  };

  const languages = (status && status.languages) || {};
  const langCodes = Object.keys(languages);
  const currentVoice = settings.ttsVoice || "af_heart";
  const currentLang =
    langCodes.find((code) => (languages[code].voices || []).includes(currentVoice)) ||
    (currentVoice[0] in languages ? currentVoice[0] : "a");
  const voices = (languages[currentLang] && languages[currentLang].voices) || [];

  const installed = status && status.status === "supported-and-installed";
  const needsSync = status && status.status === "supported-and-needs-sync";
  const unsupported = status && status.status === "unsupported";

  // Uninstall is a destructive, slow (thread-side rmtree of the whole venv
  // tree) action: confirm first, spinner while it runs, then re-fetch status
  // so the buttons flip back to "Install voice engine".
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const diskMb =
    (status && status.estimate && status.estimate.disk_mb) || 1600;
  const jaExtraMb =
    (status && status.estimate && status.estimate.ja_extra_mb) || 300;

  const doUninstall = async () => {
    setUninstalling(true);
    try {
      const res = await pyTtsUninstall();
      if (res && res.ok) {
        successToast(
          "Voice Engine Removed",
          "The Kokoro voice engine has been uninstalled. You can reinstall it any time from this screen."
        );
      } else {
        errorToast(
          "Uninstall Failed",
          String((res && res.error) || "Could not remove the voice engine.").slice(0, 300)
        );
      }
    } catch (e) {
      errorToast("Uninstall Failed", String(e && e.message ? e.message : e).slice(0, 300));
    } finally {
      await refreshTtsStatus();
      setUninstalling(false);
      setConfirmUninstall(false);
    }
  };

  return (
    <Flex direction={"column"} mt={5} width={325}>
      <Divider />
      <Flex direction={"row"} alignItems={"center"} mt={3} mb={2}>
        <i className={"bi bi-volume-up-fill"} style={{ fontSize: 22, marginRight: 10 }} />
        <Text fontWeight={"bold"}>Voice (Text-to-Speech)</Text>
      </Flex>

      {!unsupported && (
        <Text fontSize={12} color={"gray.500"} mb={2}>
          {installed
            ? "Kokoro-82M engine installed" +
              (status.ja_pack ? " (incl. Japanese)" : "") +
              "."
            : needsSync
              ? "Engine needs a small update after an AnkiBrain upgrade."
              : "Not installed yet — one click below (~" +
                ((status && status.estimate && status.estimate.download_mb) || 700) +
                " MB)."}
        </Text>
      )}
      {unsupported && (
        <Text fontSize={12} color={"gray.500"} mb={2}>
          {status.reason}
        </Text>
      )}

      {!unsupported && (
        <Button
          mb={3}
          variant={installed ? "outline" : undefined}
          colorScheme={installed ? "red" : undefined}
          onClick={() => {
            if (installed) {
              setConfirmUninstall(true);
            } else {
              openSetupModal();
            }
          }}
        >
          {installed
            ? "Uninstall voice engine"
            : needsSync
              ? "Update voice engine"
              : "Install voice engine"}
        </Button>
      )}

      {!unsupported && installed && !status.ja_pack && (
        <Button
          mb={3}
          variant={"outline"}
          onClick={() => openSetupModal("add_ja")}
        >
          Add Japanese language pack (+{jaExtraMb} MB)
        </Button>
      )}

      {installed && (
        <Modal
          isOpen={confirmUninstall}
          onClose={() => {
            if (!uninstalling) setConfirmUninstall(false);
          }}
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Uninstall voice engine?</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text fontSize={13} color={"gray.500"} mb={4}>
                This removes the Kokoro voice engine (~{diskMb} MB) from
                this computer. Audio already added to your Anki decks is
                not affected. You can reinstall with one click any time.
              </Text>
              <Button
                width={"100%"}
                variant={"solid"}
                colorScheme={"red"}
                isLoading={uninstalling}
                onClick={doUninstall}
              >
                Uninstall voice engine
              </Button>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}

      {!unsupported && installed && (
        <>
          <Text fontSize={13} mb={1}>
            Language
          </Text>
          <Select
            mb={2}
            size={"sm"}
            value={currentLang}
            onChange={(e) => {
              const code = e.target.value;
              const first = (languages[code].voices || [])[0];
              if (first) setTts("ttsVoice", first);
            }}
          >
            {langCodes.map((code) => (
              <option key={code} value={code}>
                {languages[code].name}
                {languages[code].pack === "ja" && !status.ja_pack ? " (needs ja pack)" : ""}
              </option>
            ))}
          </Select>

          <Text fontSize={13} mb={1}>
            Voice
          </Text>
          <Select
            mb={2}
            size={"sm"}
            value={currentVoice}
            onChange={async (e) => {
              await setTts("ttsVoice", e.target.value);
            }}
          >
            {voices.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>

          <Checkbox
            mb={1}
            size={"sm"}
            isChecked={settings.ttsAutoDetect !== false}
            onChange={async (e) => {
              await setTts("ttsAutoDetect", e.target.checked);
            }}
          >
            <Text as="span" fontSize={13}>Auto-detect language from text</Text>
          </Checkbox>
          <Text fontSize={11} color={"gray.500"} mb={2}>
            Speaks each text with a voice for its detected language (e.g.
            Spanish text uses a Spanish voice). The selected voice is used
            when the language can&apos;t be detected.
          </Text>

          <Text fontSize={13} mb={1}>
            Speed ({Number(settings.ttsSpeed || 1).toFixed(2)}×)
          </Text>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={Number(settings.ttsSpeed || 1)}
            mb={3}
            onChangeEnd={async (v) => {
              await setTts("ttsSpeed", v);
            }}
            onChange={(v) => {
              dispatch(editTtsSettingLocal({ key: "ttsSpeed", value: v }));
            }}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>

          <Button
            mb={2}
            variant={"outline"}
            onClick={() => {
              // Preview the SELECTED voice verbatim: auto-detection would
              // otherwise route this English sentence to the English default
              // voice and hide the user's non-English pick.
              speak("Hello! This is how AnkiBrain voice sounds.", { auto: false });
            }}
          >
            <i className={"bi bi-play-fill"} style={{ marginRight: 6 }} />
            Preview voice
          </Button>
        </>
      )}
      <Divider mt={3} />
    </Flex>
  );
};

const LocalEngineSettings = (props) => {
  const localEngine = useSelector((state) => state.localEngine);
  const status = localEngine.status;
  const startError = localEngine.startError;

  useEffect(() => {
    refreshLocalEngineStatus();
  }, []);

  const installed = status && status.status === "supported-and-installed";
  const needsSync = status && status.status === "supported-and-needs-sync";
  const unsupported = status && status.status === "unsupported";
  const lastError = status && status.last_error;
  const bannerMessage = (lastError && lastError.message) || startError;
  const bannerHint = lastError && lastError.hint;

  // Uninstall and reset are destructive and run on a python worker thread:
  // confirm first, spinner while it runs, then re-fetch status so the
  // buttons flip back.
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [working, setWorking] = useState(false);

  const diskMb = (status && status.estimate && status.estimate.disk_mb) || 1200;

  const doUninstall = async () => {
    setWorking(true);
    try {
      const res = await pyLocalEngineUninstall();
      if (res && res.ok) {
        successToast(
          "Local AI Engine Removed",
          "The local AI engine has been uninstalled. You can reinstall it any time from this screen."
        );
      } else {
        errorToast(
          "Uninstall Failed",
          String((res && res.error) || "Could not remove the local AI engine.").slice(0, 300)
        );
      }
    } catch (e) {
      errorToast("Uninstall Failed", String(e && e.message ? e.message : e).slice(0, 300));
    } finally {
      await refreshLocalEngineStatus();
      setWorking(false);
      setConfirmUninstall(false);
    }
  };

  const doReset = async () => {
    setWorking(true);
    try {
      const res = await pyLocalEngineResetData();
      if (res && res.ok) {
        // The reset deletes user_files/.env, so the key badge must not stay
        // stale.
        store.dispatch(setHasOpenaiApiKey(false));
        successToast(
          "Documents & Data Reset",
          "Local-mode documents and data were cleared. Re-import your files to use chat with documents."
        );
      } else {
        errorToast(
          "Reset Failed",
          String((res && res.error) || "Could not reset local data.").slice(0, 300)
        );
      }
    } catch (e) {
      errorToast("Reset Failed", String(e && e.message ? e.message : e).slice(0, 300));
    } finally {
      await refreshLocalEngineStatus();
      setWorking(false);
      setConfirmReset(false);
    }
  };

  return (
    <Flex direction={"column"} mt={5} width={325}>
      <Divider />
      <Flex direction={"row"} alignItems={"center"} mt={3} mb={2}>
        <i className={"bi bi-cpu-fill"} style={{ fontSize: 22, marginRight: 10 }} />
        <Text fontWeight={"bold"}>Local AI Engine</Text>
      </Flex>

      {bannerMessage && (
        <Box
          bg={"red.50"}
          borderWidth={1}
          borderColor={"red.300"}
          borderRadius={"md"}
          p={3}
          mb={3}
        >
          <Text fontWeight={"semibold"} color={"red.500"} fontSize={13} mb={1}>
            Engine error
          </Text>
          <Text fontSize={12} color={"red.500"} mb={bannerHint ? 1 : 2}>
            {String(bannerMessage).slice(0, 400)}
          </Text>
          {bannerHint && (
            <Text fontSize={11} color={"gray.600"} mb={2}>
              {bannerHint}
            </Text>
          )}
          <Button
            size={"sm"}
            colorScheme={"red"}
            onClick={() => openLocalEngineModal("default")}
          >
            Repair engine
          </Button>
        </Box>
      )}

      {!unsupported && (
        <Text fontSize={12} color={"gray.500"} mb={2}>
          {installed
            ? "Local AI engine installed."
            : needsSync
              ? "Engine needs a small update after an AnkiBrain upgrade."
              : "Not installed yet — one click below (~" +
                ((status && status.estimate && status.estimate.download_mb) || 400) +
                " MB)."}
        </Text>
      )}
      {unsupported && (
        <Text fontSize={12} color={"gray.500"} mb={2}>
          {status.reason}
        </Text>
      )}

      {!unsupported && (
        <Button
          mb={3}
          variant={installed && !bannerMessage ? "outline" : undefined}
          onClick={() => openLocalEngineModal("default")}
        >
          {bannerMessage || installed
            ? "Repair engine"
            : needsSync
              ? "Update engine"
              : "Install engine"}
        </Button>
      )}

      {!unsupported && (
        <Button
          mb={3}
          variant={"ghost"}
          onClick={async () => {
            await pyRestartAnki();
          }}
        >
          Restart AnkiBrain
        </Button>
      )}

      {!unsupported && installed && (
        <Button
          mb={3}
          variant={"outline"}
          colorScheme={"red"}
          onClick={() => setConfirmUninstall(true)}
        >
          Uninstall local AI engine
        </Button>
      )}

      {!unsupported && (
        <Button
          mb={3}
          variant={"ghost"}
          colorScheme={"red"}
          onClick={() => setConfirmReset(true)}
        >
          Reset documents &amp; data
        </Button>
      )}

      <Modal
        isOpen={confirmUninstall}
        onClose={() => {
          if (!working) setConfirmUninstall(false);
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Uninstall local AI engine?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize={13} color={"gray.500"} mb={4}>
              This removes the local AI engine runtime (~{diskMb} MB) from this
              computer. Your conversations and imported documents are kept; you
              can reinstall with one click any time.
            </Text>
            <Button
              width={"100%"}
              variant={"solid"}
              colorScheme={"red"}
              isLoading={working}
              onClick={doUninstall}
            >
              Uninstall local AI engine
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={confirmReset}
        onClose={() => {
          if (!working) setConfirmReset(false);
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reset documents &amp; data?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize={13} color={"gray.500"} mb={4}>
              This deletes the local vector store, the imported document cache,
              temporary files, and the saved OpenAI API key. Your card backups
              are not affected. Re-import your files to use chat with documents
              again.
            </Text>
            <Button
              width={"100%"}
              variant={"solid"}
              colorScheme={"red"}
              isLoading={working}
              onClick={doReset}
            >
              Reset documents &amp; data
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Divider mt={3} />
    </Flex>
  );
};

// Two rows per "Test connection": the API URL and the API key. Kept apart
// because they fail for unrelated reasons - a URL with no /models route is not
// a rejected key, and vice versa.
const KEY_STAGE = {
  accepted: { icon: "bi-check-circle-fill", color: "green", label: "accepted" },
  rejected: { icon: "bi-x-circle-fill", color: "red", label: "rejected" },
  unverified: {
    icon: "bi-exclamation-triangle-fill",
    color: "orange",
    label: "not verified",
  },
  "not-attempted": {
    icon: "bi-dash-circle",
    color: "gray",
    label: "not tested",
  },
};

const ConnectionStatus = ({ result }) => {
  const keyStatus = result.key || { status: "not-attempted", message: "" };
  const stage = KEY_STAGE[keyStatus.status] || KEY_STAGE["not-attempted"];
  return (
    <Flex
      direction={"column"}
      gap={1}
      mb={3}
      p={2}
      borderWidth={"1px"}
      borderRadius={"md"}
      fontSize={11}
    >
      <Flex gap={1} alignItems={"flex-start"}>
        <i
          className={`bi ${result.ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}`}
          style={{ color: result.ok ? "green" : "red", marginTop: 2 }}
        />
        <Text>
          <b>API URL</b> {result.urlMessage}
        </Text>
      </Flex>
      <Flex gap={1} alignItems={"flex-start"}>
        <i
          className={`bi ${stage.icon}`}
          style={{ color: stage.color, marginTop: 2 }}
        />
        <Text>
          <b>API key</b> {stage.label}
          {keyStatus.message ? ` — ${keyStatus.message}` : ""}
        </Text>
      </Flex>
    </Flex>
  );
};

// 0 (or missing) is "unset" and shows as an empty field; any other stored
// number is shown as-is.
const priceToText = (value) => (value ? String(value) : "");

export const OpenAISettings = (props) => {
  const llm = useSelector((state) => state.appSettings.ai.llmModel);
  const baseUrl = useSelector((state) => state.appSettings.ai.openaiBaseUrl);
  const models = useSelector((state) => state.appSettings.ai.openaiModels);
  const hasKey = useSelector((state) => state.appSettings.ai.hasOpenaiApiKey);
  const savedHeaders = useSelector(
    (state) => state.appSettings.ai.openaiExtraHeaders
  );
  const sessionId = useSelector(
    (state) => state.appSettings.ai.openaiSessionId
  );
  const inputCost = useSelector(
    (state) => state.appSettings.ai.openaiInputCostPer1M
  );
  const outputCost = useSelector(
    (state) => state.appSettings.ai.openaiOutputCostPer1M
  );

  // The URL field is local state so typing is not fought by the store; the
  // key is never hydrated from anywhere (the secret stays in python).
  const [url, setUrl] = useState(baseUrl || "");
  const [key, setKey] = useState("");
  // Headers are edited as JSON text: it is the only shape that covers every
  // provider's routing requirements without a per-provider form.
  const [headersText, setHeadersText] = useState(
    headersToText(savedHeaders)
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  // A headers-JSON parse failure is a field-level problem: it renders under
  // the textarea instead of as a toast/dialog.
  const [headersError, setHeadersError] = useState("");
  // Result of the last Test connection, reported as two verdicts: the API URL
  // and the API key.
  const [testResult, setTestResult] = useState(null);
  // The model is free text: the endpoint's list is a real dropdown, and a
  // provider without a /models route must still be configurable by typing.
  const [modelText, setModelText] = useState(llm || "");
  // The endpoint's model list is a real dropdown now: open/close and the
  // keyboard-highlighted row are local state; the committed value stays redux.
  // modelQuery is what the user typed *this time* - filtering by the field's
  // committed value would hide the whole list every time it is reopened.
  const [modelsOpen, setModelsOpen] = useState(false);
  const [activeModelIndex, setActiveModelIndex] = useState(-1);
  const [modelQuery, setModelQuery] = useState("");
  // Optional price override, edited as text so a blank field means "unset".
  const [inputCostText, setInputCostText] = useState(priceToText(inputCost));
  const [outputCostText, setOutputCostText] = useState(priceToText(outputCost));
  const filteredModels = models.filter((m) =>
    m.toLowerCase().includes(modelQuery.trim().toLowerCase())
  );

  useEffect(() => {
    setUrl(baseUrl || "");
  }, [baseUrl]);

  useEffect(() => {
    setModelText(llm || "");
  }, [llm]);

  useEffect(() => {
    setHeadersText(headersToText(savedHeaders));
  }, [savedHeaders]);

  useEffect(() => {
    setInputCostText(priceToText(inputCost));
  }, [inputCost]);

  useEffect(() => {
    setOutputCostText(priceToText(outputCost));
  }, [outputCost]);

  // Blank / non-numeric / negative commits as 0 ("unset"). Persisted on blur
  // so typing does not fire one python command per keystroke; the subprocess
  // reads settings.json per request, so no engine restart is needed.
  const commitCost = async (key, text, actionCreator) => {
    const parsed = parseFloat(text);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    store.dispatch(actionCreator(value));
    await pyEditSetting(key, value);
  };

  // Returns the parsed object, or null after showing why it could not be read.
  const parsedHeaders = () => {
    try {
      const parsed = parseHeadersText(headersText);
      setHeadersError("");
      return parsed;
    } catch (e) {
      setHeadersError(String(e.message).slice(0, 300));
      return null;
    }
  };

  const doTest = async () => {
    const extraHeaders = parsedHeaders();
    if (extraHeaders === null) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await pyTestOpenAIConnection({
        apiKey: key.trim() || null,
        baseUrl: url.trim() || null,
        extraHeaders,
      });
      const keyStatus = (res && res.key) || {
        status: "not-attempted",
        message: "No API key entered.",
      };
      const list = Array.isArray(res && res.models) ? res.models : [];
      // The list belongs to the URL that was just tested: refresh it when the
      // endpoint answered, drop it when it did not.
      store.dispatch(setOpenAIModels(res && res.ok ? list : []));
      await pyEditSetting("openaiModels", res && res.ok ? list : []);
      setTestResult({
        ok: !!(res && res.ok),
        urlMessage: String(
          (res && res.url_message) || "No answer from the endpoint."
        ).slice(0, 300),
        key: keyStatus,
      });
    } catch (e) {
      setTestResult({
        ok: false,
        urlMessage: String(e && e.message ? e.message : e).slice(0, 300),
        key: { status: "not-attempted", message: "Not tested." },
      });
    } finally {
      setTesting(false);
    }
  };

  const commitModel = async () => {
    const next = modelText.trim();
    if (!next || next === llm) {
      setModelText(llm || "");
      return;
    }
    await setLLMModel(next);
  };

  // A click (or Enter on a highlighted row) in the endpoint's list is already
  // a complete choice, so it commits without the free-text blur path.
  const pickModel = async (modelName) => {
    setModelText(modelName);
    setModelsOpen(false);
    setActiveModelIndex(-1);
    setModelQuery("");
    if (modelName !== llm) {
      await setLLMModel(modelName);
    }
  };

  const doSave = async () => {
    const extraHeaders = parsedHeaders();
    if (extraHeaders === null) return;
    setSaving(true);
    // Captured before the save: a changed base URL invalidates the model list
    // fetched from the old endpoint, so the LOCAL config gate's "verified
    // endpoint" must mean the currently saved URL.
    const previousBaseUrl = baseUrl || "";
    const nextBaseUrl = url.trim();
    try {
      const res = await pySetOpenAIConfig({
        apiKey: key.trim() || null,
        baseUrl: nextBaseUrl,
        extraHeaders,
      });
      if (res && res.ok) {
        store.dispatch(setOpenAIBaseUrl(nextBaseUrl));
        store.dispatch(setOpenAIExtraHeaders(extraHeaders));
        if (previousBaseUrl !== nextBaseUrl) {
          store.dispatch(setOpenAIModels([]));
          await pyEditSetting("openaiModels", []);
        }
        if (key.trim()) {
          store.dispatch(setHasOpenaiApiKey(true));
          setKey("");
        }
        successToast(
          "API Settings Saved",
          "The local AI engine is restarting with the new settings."
        );
      } else {
        errorToast(
          "Save Failed",
          String(
            (res && res.error) || "Could not save the API settings."
          ).slice(0, 300)
        );
      }
    } catch (e) {
      errorToast(
        "Save Failed",
        String(e && e.message ? e.message : e).slice(0, 300)
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex direction={"column"} mt={5} width={325}>
      <Divider />
      <Flex direction={"row"} alignItems={"center"} mt={3} mb={2}>
        <i className={"bi bi-key-fill"} style={{ fontSize: 22, marginRight: 10 }} />
        <Text fontWeight={"bold"}>OpenAI / OpenAI-compatible API</Text>
      </Flex>

      <Text fontSize={13} mb={1}>
        Provider preset
      </Text>
      <Select
        mb={2}
        size={"sm"}
        placeholder={"Choose a common provider…"}
        value={""}
        onChange={(e) => {
          // Only ever fills the URL field; the placeholder (empty value)
          // leaves whatever the user typed alone.
          if (e.target.value) setUrl(e.target.value);
        }}
      >
        {OPENAI_BASE_URL_PRESET_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.presets.map((preset) => (
              <option key={preset.url} value={preset.url}>
                {preset.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>

      <Text fontSize={13} mb={1}>
        API base URL
      </Text>
      <Input
        mb={2}
        size={"sm"}
        placeholder={"https://api.openai.com/v1"}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

      <Text fontSize={13} mb={1}>
        API key
      </Text>
      <Input
        mb={1}
        size={"sm"}
        type={"password"}
        value={key}
        placeholder={hasKey ? "Saved — leave blank to keep" : "sk-..."}
        onChange={(e) => setKey(e.target.value)}
      />
      <Text fontSize={11} color={"gray.500"} mb={2}>
        Stored locally in user_files/.env. Leave blank to keep the saved key.
      </Text>

      <Text fontSize={13} mb={1}>
        Extra headers
      </Text>
      <Textarea
        mb={1}
        size={"sm"}
        rows={3}
        fontFamily={"mono"}
        fontSize={11}
        placeholder={'{\n  "x-opencode-session": "abc123"\n}'}
        value={headersText}
        onChange={(e) => {
          setHeadersText(e.target.value);
          setHeadersError("");
        }}
      />
      <Text fontSize={11} color={"gray.500"} mb={1}>
        Sent automatically on every request: AnkiBrain identifies itself and
        sends a stable session header (x-opencode-session:{" "}
        {sessionId || "assigned on restart"}).
      </Text>
      <Text fontSize={11} color={"gray.500"} mb={2}>
        Use the field above only for anything else an endpoint requires (a JSON
        object of header name to value; a header set there overrides the
        automatic ones).
      </Text>
      {headersError && (
        <Text fontSize={11} color={"red.400"} mb={2}>
          {headersError}
        </Text>
      )}

      <Flex direction={"row"} gap={2} mb={3}>
        <Button
          size={"sm"}
          variant={"outline"}
          flex={1}
          isLoading={testing}
          onClick={doTest}
        >
          Test connection
        </Button>
        <Button size={"sm"} flex={1} isLoading={saving} onClick={doSave}>
          Save
        </Button>
      </Flex>

      {testResult && <ConnectionStatus result={testResult} />}

      <Text fontSize={13} mb={1}>
        Model
      </Text>
      <Popover
        isOpen={modelsOpen}
        onClose={() => {
          setModelsOpen(false);
          setActiveModelIndex(-1);
        }}
        placement={"bottom-start"}
        matchWidth
        isLazy
        // No PopoverTrigger: focus and the chevron button open the list, the
        // input's own onBlur closes it. Chakra must not steal focus back to a
        // (non-existent) trigger or focus the popover body on open - either
        // would blur the input and immediately close the list.
        autoFocus={false}
        returnFocusOnClose={false}
        closeOnBlur={false}
      >
        <PopoverAnchor>
          <Flex mb={1} width={"100%"}>
            <Input
              flex={1}
              size={"sm"}
              borderRightRadius={0}
              placeholder={"gpt-5.6-luna"}
              value={modelText}
              onChange={(e) => {
                setModelText(e.target.value);
                setModelQuery(e.target.value);
                setActiveModelIndex(-1);
                setModelsOpen(true);
              }}
              onFocus={() => {
                setModelQuery("");
                setModelsOpen(true);
              }}
              onClick={() => setModelsOpen(true)}
              onBlur={() => {
                setModelsOpen(false);
                setActiveModelIndex(-1);
                setModelQuery("");
                commitModel();
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setModelsOpen(true);
                  setActiveModelIndex((i) =>
                    Math.min(i + 1, filteredModels.length - 1)
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveModelIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  if (
                    modelsOpen &&
                    activeModelIndex >= 0 &&
                    filteredModels[activeModelIndex]
                  ) {
                    pickModel(filteredModels[activeModelIndex]);
                  } else {
                    commitModel();
                  }
                } else if (e.key === "Escape") {
                  setModelsOpen(false);
                  setActiveModelIndex(-1);
                }
              }}
            />
            <Button
              size={"sm"}
              borderLeftRadius={0}
              aria-label={"Show models"}
              onClick={() => {
                setModelQuery("");
                setModelsOpen((open) => !open);
              }}
            >
              <i className={"bi bi-chevron-down"} />
            </Button>
          </Flex>
        </PopoverAnchor>
        <Portal>
          <PopoverContent>
            <PopoverBody
              p={0}
              maxH={"220px"}
              overflowY={"auto"}
              role={"listbox"}
            >
              {filteredModels.length === 0 ? (
                <Text fontSize={11} color={"gray.500"} p={2}>
                  {models.length === 0
                    ? "No models listed yet. Press Test connection to load this endpoint's models."
                    : "No model matches what you typed."}
                </Text>
              ) : (
                filteredModels.map((model, i) => (
                  <Box
                    key={model}
                    role={"option"}
                    aria-selected={i === activeModelIndex}
                    px={2}
                    py={1.5}
                    fontSize={12}
                    cursor={"pointer"}
                    bg={i === activeModelIndex ? "gray.100" : undefined}
                    _hover={{ bg: "gray.100" }}
                    // Keep focus in the input so its onBlur does not fire before
                    // the click lands and unmounts this row.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveModelIndex(i)}
                    onClick={() => pickModel(model)}
                  >
                    {model}
                  </Box>
                ))
              )}
            </PopoverBody>
          </PopoverContent>
        </Portal>
      </Popover>
      {models.length > 0 && !models.includes(llm) && (
        <Text fontSize={11} color={"orange.500"} mb={1}>
          {llm} is not in this endpoint's model list.
        </Text>
      )}
      <Text fontSize={11} color={"gray.500"} mb={2}>
        {models.length > 0
          ? `${models.length} models listed by this endpoint. `
          : ""}
        Restart AnkiBrain from Local AI Engine below for a model change to take
        effect.
      </Text>

      <Text fontWeight={"bold"} fontSize={13} mb={1}>
        Session cost (optional)
      </Text>
      <Text fontSize={11} color={"gray.500"} mb={2}>
        Leave both blank to use the cost this endpoint reports, or AnkiBrain's
        built-in price for its recommended models. Fill them in (USD per 1M
        tokens) to price any other model yourself. Applies to the next message,
        no restart needed.
      </Text>
      <Flex gap={2} mb={2}>
        <Input
          flex={1}
          size={"sm"}
          placeholder={"Input $ / 1M tokens"}
          value={inputCostText}
          onChange={(e) => setInputCostText(e.target.value)}
          onBlur={() =>
            commitCost(
              "openaiInputCostPer1M",
              inputCostText,
              setOpenAIInputCostPer1M
            )
          }
        />
        <Input
          flex={1}
          size={"sm"}
          placeholder={"Output $ / 1M tokens"}
          value={outputCostText}
          onChange={(e) => setOutputCostText(e.target.value)}
          onBlur={() =>
            commitCost(
              "openaiOutputCostPer1M",
              outputCostText,
              setOpenAIOutputCostPer1M
            )
          }
        />
      </Flex>

      <Divider mt={3} />
    </Flex>
  );
};

const AdvancedSettings = (props) => {
  const temperature = useSelector((state) => state.appSettings.ai.temperature);
  const llm = useSelector((state) => state.appSettings.ai.llmModel);
  // Out-of-range temperature is a field-level problem: inline, not a dialog.
  const [temperatureError, setTemperatureError] = useState("");
  const dispatch = useDispatch();
  const devMode = useSelector((state) => state.devMode.value);
  const apiBaseUrl = useSelector((state) => state.apiBaseUrl.value);
  const user = useSelector((state) => state.user.value);

  return (
    <Box {...props}>
      <Flex direction={"row"} justifyContent={"center"}>
        <Flex direction={"column"} me={2}>
          <Tag p={3} justifyContent={"center"}>
            Large Language Model (LLM)
          </Tag>
          <Tag mt={5} p={3} justifyContent={"center"}>
            Temperature (0-1)
          </Tag>
        </Flex>

        <Flex direction={"column"} width={500}>
          {!isLocalMode() && (
            <Select
              value={llm}
              onChange={async (e) => {
                await setLLMModel(e.target.value);
              }}
            >
              <option value={"gpt-5.6-sol"}>GPT-5.6 Sol (very expensive)</option>
              <option value={"gpt-5.6-terra"}>GPT-5.6 Terra (expensive)</option>
              <option value={"gpt-5.6-luna"}>GPT-5.6 Luna (best value)</option>
            </Select>
          )}
          {isLocalMode() && (
            <Text fontSize={12} color={"gray.500"}>
              Set the model in Basic → OpenAI / OpenAI-compatible API.
            </Text>
          )}
          <Input
            value={temperature}
            onKeyDown={(e) => {
              const allowedKeys = ["Backspace", "."];
              const isNumber = !isNaN(Number(e.key));
              const isAllowed = isNumber || allowedKeys.includes(e.key);
              if (!isAllowed) {
                e.preventDefault();
              }
            }}
            onChange={async (e) => {
              const isNumber = !isNaN(Number(e.target.value));
              if (isNumber) {
                const number = Number(e.target.value);
                if (number < 0 || number > 1) {
                  setTemperatureError(
                    "Enter a temperature between 0 and 1."
                  );
                } else {
                  setTemperatureError("");
                  await setTemperature(e.target.value);
                }
              }
            }}
            mt={5}
          />
          {temperatureError && (
            <Text fontSize={11} color={"red.400"} mt={1}>
              {temperatureError}
            </Text>
          )}
          {isLocalMode() && (
            <Text fontSize={11} color={"gray.500"} mt={1}>
              Model and temperature changes take effect after Restart AnkiBrain
              (Settings → Local AI Engine).
            </Text>
          )}
        </Flex>
      </Flex>

      <Divider />

      <Flex direction={"row"} alignSelf={"center"} justifyContent={"center"}>
        <Tag mt={5} p={3} justifyContent={"center"} me={2}>
          Developer Mode
        </Tag>
        <Switch
          alignSelf={"start"}
          isChecked={devMode}
          onChange={async (e) => {
            if (window.developerMode) {
              let devMode = e.target.checked;
              await pyEditSetting("devMode", devMode);
              dispatch(setDevMode(devMode));
              setupServerAPI();
            } else {
              e.preventDefault();
              infoToast(
                "No Access",
                "You do not have access to developer mode at this time."
              );
            }
          }}
          mt={8}
        />
      </Flex>

      <Flex justifyContent={"center"} mt={5}>
        <Text fontSize={12} color={"gray"}>
          Server: {apiBaseUrl}
        </Text>
      </Flex>
    </Box>
  );
};

export const SettingsScreen = (props) => {
  const [passwordResetMode, setPasswordResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const [showGetHelpModal, setShowGetHelpModal] = useState(false);
  const [showUserInterfaceSettings, setShowUserInterfaceSettings] =
    useState(false);
  const showBootReminderDialog = useSelector(
    (state) => state.showBootReminderDialog.value
  );
  const showCardBottomHint = useSelector(
    (state) => state.showCardBottomHint.value
  );
  const deleteCardsAfterAdding = useSelector(
    (state) => state.deleteCardsAfterAdding.value
  );
  // Stored key is showSidePanel (true = visible at boot); the switch shows its
  // inverse, matching the Anki menu item.
  const showSidePanel = useSelector((state) => state.showSidePanel.value);
  const startMinimized = !showSidePanel;

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const language = useSelector((store) => store.language.value);
  const [selectedLanguage, setSelectedLanguage] = useState(
    store.getState().language.value
  );

  const [showCustomLanguageInput, setShowCustomLanguageInput] = useState(false);

  const pwResetClose = () => {
    setPasswordResetMode(false);
  };

  const setShowCardBottomHint = async (value) => {
    dispatch(setStoreShowCardBottomHint(value));
    await pyEditSetting("showCardBottomHint", value);
  };

  const handleChangeDeleteCardsAfterAdding = async (value) => {
    dispatch(setDeleteCardsAfterAdding(value));
    await pyEditSetting("deleteCardsAfterAdding", value);
  };

  const setStartMinimized = async (value) => {
    dispatch(setStoreShowSidePanel(!value));
    await pyEditSetting("showSidePanel", !value);
  };

  const dispatch = useDispatch();

  return (
    <>
      <Modal isOpen={passwordResetMode} onClose={pwResetClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reset Password</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction={"column"}>
              <Flex direction={"row"} mb={5}>
                <Tag p={3} me={2} justifyContent={"center"} width={100}>
                  Email
                </Tag>
                <Input
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                  placeholder={"Enter your email address..."}
                />
              </Flex>
              <Button
                variant={"accent"}
                alignSelf={"center"}
                onClick={async () => {
                  let res = await postRequestPasswordResetCode(email);
                  if (res.status === "success") {
                    successToast(
                      "Password Reset Email",
                      "A password reset verification code has been sent to the email address given."
                    );
                  }
                }}
              >
                Send verification code
              </Button>

              <Divider />

              <Flex direction={"row"} mt={3} mb={3}>
                <Tag
                  p={3}
                  me={2}
                  justifyContent={"center"}
                  whiteSpace={"nowrap"}
                  width={225}
                >
                  New Password
                </Tag>
                <Input
                  value={password}
                  type={"password"}
                  onChange={(e) => {
                    setPassword(e.target.value);
                  }}
                  placeholder={"Enter new password..."}
                />
              </Flex>

              <Flex direction={"row"}>
                <Tag
                  p={3}
                  me={2}
                  justifyContent={"center"}
                  whiteSpace={"nowrap"}
                  width={225}
                >
                  Verification Code
                </Tag>

                <Input
                  value={verificationCode}
                  onChange={(e) => {
                    setVerificationCode(e.target.value);
                  }}
                  placeholder={"Enter verification code..."}
                />
              </Flex>
              <Button
                variant={"secondary"}
                mt={5}
                mb={5}
                onClick={async () => {
                  let res = await postPasswordReset(
                    email,
                    password,
                    verificationCode
                  );

                  if (!res) {
                    errorToast("Request error", res);
                    return;
                  }

                  if (res && res.status === "success") {
                    successToast(
                      "Password Reset Successfully",
                      "Your password has been reset. You can now login with your new password."
                    );
                  }
                }}
              >
                Change Password
              </Button>
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
      <Box {...props}>
        <Tabs align={"center"}>
          <TabList>
            <Tab>Basic</Tab>
            <Tab>Advanced</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <Flex direction={"column"} alignItems={"center"}>
                <Button p={0} width={325} variant={"accent"}>
                  <a
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    href={"https://donate.stripe.com/8x25kx8ZM7dx66RcMa7N600"}
                  >
                    <BiDonateHeart size={30} style={{ marginRight: 5 }} />
                    Donate
                  </a>
                </Button>
                <Button mt={5} width={325} p={0} variant={"secondary"}>
                  <a
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    href={"https://ankiweb.net/shared/info/1915225457"}
                  >
                    <MdOutlineRateReview size={28} style={{ marginRight: 5 }} />
                    Review on AnkiWeb
                  </a>
                </Button>

                <Divider />

                <Button
                  width={325}
                  display={"flex"}
                  alignItems={"center"}
                  onClick={() => {
                    setShowUserInterfaceSettings(true);
                  }}
                >
                  <BsLayoutTextWindowReverse
                    size={24}
                    style={{ marginRight: 10 }}
                  />
                  User Interface Settings
                </Button>

                <Modal
                  isOpen={showUserInterfaceSettings}
                  onClose={() => {
                    setShowUserInterfaceSettings(false);
                  }}
                >
                  <ModalOverlay />
                  <ModalContent>
                    <ModalHeader>User Interface Settings</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                      <Flex direction={"row"} justifyContent={"space-between"}>
                        <Flex direction={"column"}>
                          <Text>
                            When I click "Add Cards to Anki", clear my AnkiBrain
                            cards
                          </Text>
                          <Text fontSize={12} color={"gray"}>
                            If this option is enabled, then after you add cards
                            to an Anki deck, cards inside of AnkiBrain will be
                            cleared.
                          </Text>
                        </Flex>
                        <Switch
                          isChecked={deleteCardsAfterAdding}
                          onChange={async () => {
                            await handleChangeDeleteCardsAfterAdding(
                              !deleteCardsAfterAdding
                            );
                          }}
                        />
                      </Flex>
                      <Flex direction={"row"} justifyContent={"space-between"}>
                        <Flex direction={"column"}>
                          <Text>
                            Show AnkiBrain interaction hint at the bottom of
                            Anki cards while reviewing
                          </Text>
                          <Text fontSize={12} color={"gray"}>
                            If this option is enabled, then when you are
                            reviewing cards you will see the small bottom text
                            "Highlight any text on this card to interact with
                            AnkiBrain"
                          </Text>
                        </Flex>
                        <Switch
                          isChecked={showCardBottomHint}
                          onChange={async () => {
                            await setShowCardBottomHint(!showCardBottomHint);
                          }}
                        />
                      </Flex>
                      <Flex direction={"row"} justifyContent={"space-between"}>
                        <Flex direction={"column"}>
                          <Text>
                            Show donation/review reminder when AnkiBrain starts
                          </Text>
                        </Flex>
                        <Switch
                          isChecked={showBootReminderDialog}
                          onChange={async () => {
                            dispatch(
                              setShowBootReminderDialog(!showBootReminderDialog)
                            );
                            await pyEditSetting(
                              "showBootReminderDialog",
                              !showBootReminderDialog
                            );
                          }}
                        />
                      </Flex>
                      <Flex direction={"row"} justifyContent={"space-between"}>
                        <Flex direction={"column"}>
                          <Text>Start AnkiBrain minimized</Text>
                          <Text fontSize={12} color={"gray"}>
                            AnkiBrain's panel stays hidden each time Anki
                            starts. Open it any time with Anki's AnkiBrain →
                            Show/Hide AnkiBrain menu item.
                          </Text>
                        </Flex>
                        <Switch
                          isChecked={startMinimized}
                          onChange={async () => {
                            await setStartMinimized(!startMinimized);
                          }}
                        />
                      </Flex>
                    </ModalBody>
                    <ModalFooter />
                  </ModalContent>
                </Modal>

                <Button
                  width={325}
                  mt={5}
                  display={"flex"}
                  alignItems={"center"}
                  onClick={() => {
                    setShowLanguageModal(true);
                  }}
                >
                  <MdLanguage size={24} style={{ marginRight: 10 }} />
                  Change AI Language
                </Button>

                <Modal
                  isOpen={showLanguageModal}
                  onClose={() => {
                    setShowLanguageModal(false);
                  }}
                >
                  <ModalOverlay />
                  <ModalContent>
                    <ModalHeader>AnkiBrain AI Language</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                      <Flex direction={"column"}>
                        <Text fontSize={14} color={"gray"}>
                          Please select your language below, or type in a custom
                          language. This option changes the output text of AI
                          responses. This does not change AnkiBrain's user
                          interface language.
                        </Text>
                        <Select
                          value={
                            selectedLanguage !== "Other"
                              ? selectedLanguage
                              : "Other"
                          }
                          onChange={async (e) => {
                            let newSelectedLanguage = e.target.value;
                            if (newSelectedLanguage !== "Other") {
                              setShowCustomLanguageInput(false);
                              setSelectedLanguage(newSelectedLanguage);
                              dispatch(setLanguage(newSelectedLanguage));
                              await pyEditSetting(
                                "aiLanguage",
                                newSelectedLanguage
                              );
                            } else {
                              setShowCustomLanguageInput(true);
                              setSelectedLanguage(newSelectedLanguage);
                            }
                          }}
                        >
                          <option value={"English"}>English</option>
                          <option value={"Spanish"}>Spanish</option>
                          <option value={"Albanian"}>Albanian</option>
                          <option value={"Arabic"}>Arabic</option>
                          <option value={"Armenian"}>Armenian</option>
                          <option value={"Azerbaijani"}>Azerbaijani</option>
                          <option value={"Belarusian"}>Belarusian</option>
                          <option value={"Bengali"}>Bengali</option>
                          <option value={"Bulgarian"}>Bulgarian</option>
                          <option value={"Bosnian"}>Bosnian</option>
                          <option value={"Chinese (Mandarin)"}>
                            Chinese (Mandarin)
                          </option>
                          <option value={"Chinese (Cantonese)"}>
                            Chinese (Cantonese)
                          </option>
                          <option value={"Croatian"}>Croatian</option>
                          <option value={"Czech"}>Czech</option>
                          <option value={"Danish"}>Danish</option>
                          <option value={"Dutch"}>Dutch</option>
                          <option value={"Estonian"}>Estonian</option>
                          <option value={"Farsi (Persian)"}>
                            Farsi (Persian)
                          </option>
                          <option value={"Filipino"}>Filipino</option>
                          <option value={"Finnish"}>Finnish</option>
                          <option value={"French"}>French</option>
                          <option value={"German"}>German</option>
                          <option value={"Greek"}>Greek</option>
                          <option value={"Hindi"}>Hindi</option>
                          <option value={"Icelandic"}>Icelandic</option>
                          <option value={"Indonesian"}>Indonesian</option>
                          <option value={"Irish (Gaelic)"}>
                            Irish (Gaelic)
                          </option>
                          <option value={"Italian"}>Italian</option>
                          <option value={"Japanese"}>Japanese</option>
                          <option value={"Kazakh"}>Kazakh</option>
                          <option value={"Khmer"}>Khmer</option>
                          <option value={"Korean"}>Korean</option>
                          <option value={"Kurdish"}>Kurdish</option>
                          <option value={"Hebrew"}>Hebrew</option>
                          <option value={"Hungarian"}>Hungarian</option>
                          <option value={"Malay"}>Malay</option>
                          <option value={"Mongolian"}>Mongolian</option>
                          <option value={"Norwegian"}>Norwegian</option>
                          <option value={"Polish"}>Polish</option>
                          <option value={"Portuguese"}>Portuguese</option>
                          <option value={"Romanian"}>Romanian</option>
                          <option value={"Russian"}>Russian</option>
                          <option value={"Serbian"}>Serbian</option>
                          <option value={"Swedish"}>Swedish</option>
                          <option value={"Thai"}>Thai</option>
                          <option value={"Turkish"}>Turkish</option>
                          <option value={"Ukrainian"}>Ukrainian</option>
                          <option value={"Urdu"}>Urdu</option>
                          <option value={"Vietnamese"}>Vietnamese</option>
                          <option value={"Other"}>Other</option>
                        </Select>
                        {showCustomLanguageInput && (
                          <Input
                            placeholder={"Custom language..."}
                            mt={3}
                            value={language}
                            onChange={async (e) => {
                              dispatch(setLanguage(e.target.value));
                              await pyEditSetting("aiLanguage", e.target.value);
                            }}
                          />
                        )}
                      </Flex>
                    </ModalBody>
                    <ModalFooter></ModalFooter>
                  </ModalContent>
                </Modal>

                <UserModeSettings />

                <VoiceSettings />

                {isLocalMode() && <LocalEngineSettings />}

                {isLocalMode() && <OpenAISettings />}

                <Button
                  width={325}
                  mt={5}
                  display={"flex"}
                  alignItems={"center"}
                  onClick={() => {
                    infoToast(
                      "Coming Soon",
                      "This feature is coming soon! Hang tight!"
                    );
                  }}
                >
                  <BsPaletteFill size={24} style={{ marginRight: 10 }} />
                  Appearance & Themes
                </Button>

                {!isLocalMode() && (
                  <Button
                    mt={5}
                    width={325}
                    onClick={() => {
                      setPasswordResetMode(true);
                    }}
                  >
                    <RiLockPasswordFill
                      size={24}
                      style={{ marginRight: 7.5 }}
                    />
                    Reset Password
                  </Button>
                )}

                <Divider />

                <Button mt={0} width={325} p={0}>
                  <a
                    href={"https://forms.gle/hLBTRr1d13txDwzg8"}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    Submit Feature Request
                  </a>
                </Button>
                <Button mt={5} width={325} p={0}>
                  <a
                    href={"https://forms.gle/jVV6Lxdp6q7zVNrG6"}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    Submit Bug Report
                  </a>
                </Button>
              </Flex>
            </TabPanel>
            <TabPanel>
              <AdvancedSettings />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </>
  );
};

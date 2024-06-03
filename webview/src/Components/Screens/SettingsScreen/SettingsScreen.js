import {
  Box,
  Button,
  Divider,
  Flex,
  Grid,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Text,
} from "@chakra-ui/react";
import "./SettingsScreen.css";
import { errorToast, infoToast, successToast } from "../../../api/toast";
import {
  setLLMProvider,
  setLLMModel,
  setTemperature,
} from "../../../api/settings";
import { setShowCardBottomHint as setStoreShowCardBottomHint } from "../../../api/redux/slices/showCardBottomHint";
import { useDispatch, useSelector } from "react-redux";
import { isLocalMode } from "../../../api/user";
import { setDevMode } from "../../../api/redux/slices/devMode";
import { setupServerAPI } from "../../../api/server-api/networking";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";
import React, { useState, useEffect } from "react";
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
import { setAutomaticallyAddCards } from "../../../api/redux/slices/automaticallyAddCards";
import { setDeleteCardsAfterAdding } from "../../../api/redux/slices/deleteCardsAfterAdding";
import { setShowBootReminderDialog } from "../../../api/redux/slices/showBootReminderDialog";

const AdvancedSettings = (props) => {
  const provider = useSelector((state) => state.appSettings.ai.llmProvider);
  const temperature = useSelector((state) => state.appSettings.ai.temperature);
  const llm = useSelector((state) => state.appSettings.ai.llmModel);
  const dispatch = useDispatch();
  const devMode = useSelector((state) => state.devMode.value);
  const apiBaseUrl = useSelector((state) => state.apiBaseUrl.value);
  const user = useSelector((state) => state.user.value);
  const ollamaModels = useSelector((state) => state.ollamaModels.value);
  const llmOptions = {
    openai: [
      { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo (default)" },
      { value: "gpt-4", label: "gpt-4 (expensive)" },
    ],
    ollama: ollamaModels.map((model) => ({ value: model.model, label: model.name })),
  };

  useEffect(() => {
    if (llm == "") {
      setLLMModel(ollamaModels[0].model)
    }
  }, [ollamaModels])

  return (
    <Box {...props}>
      <Grid templateColumns="max-content 1fr" gap={6}>
        <Tag p={3} justifyContent={"center"} maxWidth={300}>
          Provider
        </Tag>
        <Select
          value={provider}
          onChange={async (e) => {
            await setLLMProvider(e.target.value);
            const defaultModel = llmOptions[e.target.value]
            await setLLMModel(defaultModel.length ? defaultModel[0].value : "");
            if (isLocalMode()) {
              successToast(
                "Provider Changed",
                "The AI Provider has been changed. Please restart AnkiBrain for this change to take effect."
              );
            }
          }}
        >
          <option value={"openai"}>OpenAI</option>
          <option value={"ollama"}>Ollama</option>
        </Select>
        <Tag p={3} justifyContent={"center"} maxWidth={300}>
          Large Language Model (LLM)
        </Tag>
        <div>
          <Select
            value={llm}
            onChange={async (e) => {
              await setLLMModel(e.target.value);
              if (isLocalMode()) {
                successToast(
                  "LLM Changed",
                  "The AI Language Model has been changed. Please restart AnkiBrain for this change to take effect."
                );
              }
            }}
          >
            {provider === "openai" &&
              llmOptions.openai.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            {provider === "ollama" &&
              llmOptions.ollama.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </Select>
          {provider === "ollama" && llmOptions.ollama.length === 0 && (
            <Text mt={5} p={3} justifyContent={"center"} maxWidth={300} color="red.500">
              No Ollama models found. Please assure the server is running and that you have set up Ollama correctly.
            </Text>
          )}
        </div>

        <Tag mt={5} p={3} justifyContent={"center"} maxWidth={300}>
          Temperature (0-1)
        </Tag>
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
                errorToast(
                  "Invalid Temperature",
                  "Please enter a temperature between 0 and 1."
                );
              } else {
                await setTemperature(e.target.value);
                if (isLocalMode()) {
                  successToast(
                    "Temperature Changed",
                    "The AI temperature has been changed. Please restart AnkiBrain for this change to take effect."
                  );
                }
              }
            }
          }}
          mt={5}
        />
      </Grid>

      <Divider orientation="vertical" />

      <Flex
        flexDirection={"column"}
        justifyContent={"center"}
        alignItems={"center"}
        mt={5}
      >
        <Tag mt={5} p={3} justifyContent={"center"}>
          Developer Mode
        </Tag>
        <div>
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
        </div>
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
  const automaticallyAddCards = useSelector(
    (state) => state.automaticallyAddCards.value
  );
  const deleteCardsAfterAdding = useSelector(
    (state) => state.deleteCardsAfterAdding.value
  );

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

  const handleChangeAutoAddCards = async (value) => {
    dispatch(setAutomaticallyAddCards(value));
    await pyEditSetting("automaticallyAddCards", value);
  };

  const handleChangeDeleteCardsAfterAdding = async (value) => {
    dispatch(setDeleteCardsAfterAdding(value));
    await pyEditSetting("deleteCardsAfterAdding", value);
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
                    href={"https://donate.stripe.com/7sI16Z1jYdo698I9AC"}
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
                            Automatically add every 100 cards to Anki with
                            auto-clearing (recommended)
                          </Text>
                          <Text fontSize={12} color={"gray"}>
                            If this option is enabled, AnkiBrain will
                            automatically add every 100 cards to any selected
                            deck. This will also clear your AnkiBrain cards
                            after they are added to Anki, in order to prevent
                            duplicates in your deck. This option is recommended,
                            because large numbers of cards (in the thousands)
                            can cause the program to lag/freeze and you may lose
                            your progress.
                          </Text>
                        </Flex>
                        <Switch
                          isChecked={automaticallyAddCards}
                          onChange={async () => {
                            await handleChangeAutoAddCards(
                              !automaticallyAddCards
                            );
                          }}
                        />
                      </Flex>
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

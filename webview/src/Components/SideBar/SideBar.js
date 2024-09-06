import "./SideBar.css";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router";
import React, { useEffect, useState } from "react";
import { PATHS } from "../../api/constants";
import { Dropdown } from "bootstrap";
import { useDispatch, useSelector } from "react-redux";
import { setShowLoginModal, store, updateUser } from "../../api/redux";
import {
  Box,
  Button,
  Divider,
  Flex,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import { SettingsIcon } from "@chakra-ui/icons";
import { isLocalMode, logout } from "../../api/user";
import { errorToast, infoToast } from "../../api/toast";
import { postCreateCheckoutSession } from "../../api/server-api/networking/checkout";
import { setAppAlertModal } from "../../api/redux/slices/appAlertModal";
import { getAPIEndpoints } from "../../api/server-api/networking";
import { MdDarkMode } from "react-icons/md";
import { BsSunFill } from "react-icons/bs";
import { FaStripe } from "react-icons/fa";
import { LiaMoneyBillWaveAltSolid } from "react-icons/lia";
import { pyEditSetting } from "../../api/PythonBridge/senders/pyEditSetting";
import { setColorMode } from "../../api/redux/slices/colorMode";
import { getUser } from "../../api/server-api/networking/user";
import { IoHelpCircleOutline } from "react-icons/io5";

export function SideBar(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.user.value);
  const cost = useSelector((state) => state.cost);
  const userMode = useSelector((state) => state.userMode.value);
  const { colorMode, toggleColorMode } = useColorMode();
  const language = useSelector((state) => state.language.value);
  const dispatch = useDispatch();
  const activeStyle = {
    borderBottomStyle: "solid",
    borderBottomColor: "var(--color-accent)",
    borderBottomWidth: 1,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  };

  const storeColorMode = useSelector((state) => state.colorMode.value);
  useEffect(() => {
    if (!storeColorMode) return;
    if (storeColorMode !== colorMode) {
      toggleColorMode();
    }
  }, [storeColorMode, colorMode, toggleColorMode]);

  const currentVersion = useSelector((state) => state.currentVersion.value);
  const [showGetHelpModal, setShowGetHelpModal] = useState(false);
  let loggedIn = !!user;
  useEffect(() => {
    loggedIn = !!user;
  }, [user]);

  async function handleAddBalanceClick() {
    let res = await postCreateCheckoutSession(user.accessToken);
    if (res.status === "success") {
      let url = res.data.url;
      dispatch(
        setAppAlertModal({
          show: true,
          header: "Add Balance",
          alertText: (
            <Flex
              width={"100%"}
              height={"100%"}
              justifyContent={"center"}
              alignSelf={"center"}
              direction={"column"}
            >
              <Heading fontSize={18}>Pricing Information</Heading>
              <Text fontSize={12}>
                AnkiBrain Server Mode uses "pay as you go" pricing and aims to
                keep AnkiBrain as cheap as possible to make it accessible to all
                users across the world. Using GPT 3.5 Turbo (default) is very
                cost-effective, and it is recommended for most users and most
                usage scenarios.
              </Text>

              <Text fontSize={12}>
                GPT 3.5 Turbo can generate <b>1000 flashcards</b> from a
                document for about <b>$0.39</b> (based on real-life testing).
                GPT 4 is quite expensive and will cost about $0.015 per
                flashcard, for similar quality.
              </Text>
              <Text fontSize={12}>
                $1.00 is enough to embed (vectorize) <b>3,000 pages</b> of
                documents. This is the cost that occurs when you import a
                document for analysis. There is no additional cost for making
                flashcards out of a document.
              </Text>
              <Text fontSize={12}>
                $1.00 is enough to store approximately{" "}
                <b>2,850 pages of text</b> in your account for one month.
              </Text>
              <Text fontSize={10} color={"gray"}>
                Files are stored in a vector database, see{" "}
                <a
                  href={getAPIEndpoints().PRIVACY_POLICY}
                  style={{ color: "blue" }}
                >
                  Privacy Policy
                </a>{" "}
                for more information.
              </Text>
              <Divider />
              <Button variant={"accent"} p={0}>
                <a
                  href={url}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <FaStripe size={48} style={{ marginRight: 7.5, top: 1 }} />
                  Add Balance
                </a>
              </Button>
              {/*<Button mt={3} alignItems={"center"} p={0}>*/}
              {/*  <a*/}
              {/*    href={"https://forms.gle/tjz6LRomcaBVpc7CA"}*/}
              {/*    style={{*/}
              {/*      width: "100%",*/}
              {/*      height: "100%",*/}
              {/*      display: "flex",*/}
              {/*      justifyContent: "center",*/}
              {/*      alignItems: "center",*/}
              {/*    }}*/}
              {/*  >*/}
              {/*    <LiaMoneyBillWaveAltSolid*/}
              {/*      size={30}*/}
              {/*      style={{ marginRight: 7.5 }}*/}
              {/*    />*/}
              {/*    Request Free Credits*/}
              {/*  </a>*/}
              {/*</Button>*/}
            </Flex>
          ),
          onClose: async () => {
            // Refresh user to make sure balance is updated.
            let res = await getUser(store.getState().user.value.accessToken);
            if (res.status === "success") {
              infoToast(
                "Refreshing User Information...",
                "Refreshing your user information to reflect any added balance.",
                1000
              );
              dispatch(updateUser(res.data.user));
            }
          },
        })
      );
    }
  }

  return (
    <div className={"SideBar d-flex p-0"} style={props.style}>
      <div
        className={
          "container d-flex flex-column justify-content-around pt-1 pb-3"
        }
        style={{ flex: 1 }}
      >
        {/*
         * Get help modal.
         */}
        <Modal
          isOpen={showGetHelpModal}
          onClose={() => {
            setShowGetHelpModal(false);
          }}
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Get Help</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text>
                <b>
                  For fast support, please email{" "}
                  <a
                    href={"mailto:ankibrain@rankmd.org"}
                    style={{ color: colorMode === "light" ? "blue" : "cyan" }}
                  >
                    ankibrain@rankmd.org
                  </a>
                  {"."}
                </b>
                <p />
                <p>
                  You can also visit{" "}
                  <a href={"https://www.reddit.com/r/ankibrain"}>
                    https://www.reddit.com/r/ankibrain/
                  </a>
                </p>
              </Text>
            </ModalBody>
            <ModalFooter />
          </ModalContent>
        </Modal>

        <Box mt={5}>
          <h5>AnkiBrain</h5>
          <Text fontSize={12} m={0} p={0}>
            Version {currentVersion} {currentVersion < "1" ? "Beta" : ""}
          </Text>
          {process.env.REACT_APP_ENV === "DEV" && (
            <Text fontSize={12} m={0} p={0}>
              Dev Mode
            </Text>
          )}
          <Text fontSize={12} m={0} p={0} mb={2}>
            {language}
          </Text>
        </Box>

        <Button
          m={0}
          mb={2}
          p={0}
          width={35}
          height={35}
          alignSelf={"center"}
          onClick={async (e) => {
            dispatch(setColorMode(colorMode === "dark" ? "light" : "dark"));
            e.currentTarget.blur();

            // Current colorMode is the opposite of what we're changing to
            await pyEditSetting(
              "colorMode",
              colorMode === "dark" ? "light" : "dark"
            );
          }}
        >
          {colorMode === "light" ? (
            <MdDarkMode fontSize={20} />
          ) : (
            <BsSunFill fontSize={20} />
          )}
        </Button>

        <div className={"MainButtonsContainer"} style={{ flex: 1 }}>
          <div
            className={"SideBarButton"}
            style={
              location.pathname === PATHS.TOPIC_EXPLANATION ? activeStyle : {}
            }
            onClick={() => {
              navigate(PATHS.TOPIC_EXPLANATION);
            }}
          >
            <i className="bi bi-book me-2"></i>
            <span>Topic Explanation</span>
          </div>

          <div
            className={"SideBarButton"}
            style={location.pathname === PATHS.MAKE_CARDS ? activeStyle : {}}
            onClick={() => {
              navigate(PATHS.MAKE_CARDS);
            }}
          >
            <i className="bi bi-stack me-2"></i>
            <span>Make Cards</span>
          </div>

          <div
            className={"SideBarButton"}
            style={location.pathname === PATHS.TALK ? activeStyle : {}}
            onClick={() => {
              navigate(PATHS.TALK);
            }}
          >
            <i className="bi bi-chat-fill me-2"></i>
            <span>Talk</span>
          </div>

          <div
            className={"SideBarButton"}
            style={location.pathname === PATHS.IMPORT ? activeStyle : {}}
            onClick={() => {
              navigate(PATHS.IMPORT);
            }}
          >
            <i className="bi bi-folder me-2"></i>
            <span>Import</span>
          </div>

          <div
            className={"SideBarButton"}
            style={
              location.pathname === PATHS.SETTINGS
                ? { ...activeStyle, paddingTop: 7.5, paddingBottom: 7.5 }
                : { paddingTop: 7.5, paddingBottom: 7.5 }
            }
            onClick={() => {
              navigate(PATHS.SETTINGS);
            }}
          >
            <SettingsIcon me={2} />
            <span>Settings</span>
          </div>

          <div
            className={"SideBarButton"}
            style={{ padding: 5 }}
            onClick={() => {
              setShowGetHelpModal(true);
            }}
          >
            <IoHelpCircleOutline
              size={30}
              style={{ marginRight: 5, marginLeft: -5 }}
            />
            <span>Help</span>
          </div>
        </div>

        {!loggedIn && userMode === "SERVER" && (
          <Button
            variant={"accent"}
            width={125}
            onClick={() => {
              dispatch(setShowLoginModal(true));
            }}
          >
            Login
          </Button>
        )}

        {loggedIn && userMode === "SERVER" && (
          <div>
            <div id={"ProfileDropdown"} className={"dropdown m-0 p-0"}>
              <i
                id={"ProfileButton"}
                className={"bi bi-person-circle"}
                style={{ color: "white" }}
                onClick={() => {
                  const dropdown = new Dropdown(
                    document.getElementById("ProfileDropdown")
                  );
                  dropdown.toggle();
                }}
              />
              <div className="dropdown-menu" aria-labelledby="popupMenuButton">
                <div
                  className="dropdown-item"
                  onClick={async () => {
                    const dropdown = new Dropdown(
                      document.getElementById("ProfileDropdown")
                    );
                    dropdown.toggle();
                    await logout();
                  }}
                >
                  Logout
                </div>
              </div>
            </div>

            <div className={"AccountInfoContainer d-flex flex-column mt-2"}>
              <Text
                fontSize={10}
                p={0}
                m={0}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </Text>

              <Text fontSize={10} p={0} m={0}>
                Balance: ${user.balance.toFixed(2)}
              </Text>
              <Text fontSize={10} p={0} m={0} mb={2}>
                Monthly Storage: ${user.monthlyStorageCharge.toFixed(2)}
              </Text>
            </div>
          </div>
        )}

        {loggedIn && userMode === "SERVER" && (
          <Button
            width={125}
            variant={"accent"}
            onClick={async () => {
              try {
                if (store.getState().lockCheckoutSession.value) {
                  infoToast(
                    "Busy...",
                    "Please finish what you are doing before adding balance!"
                  );
                } else {
                  await handleAddBalanceClick();
                }
              } catch (err) {
                errorToast("Error", err.message);
              }
            }}
          >
            Add Balance
          </Button>
        )}

        {/*
         * Cost container for local mode (session use).
         */}
        {userMode === "LOCAL" && (
          <Flex direction={"column"} fontSize={12}>
            <Text>Session usage: ${cost.session.toFixed(2)}</Text>
          </Flex>
        )}

        {isLocalMode() && (
          <Button mt={2} p={0} variant={"accent"} width={125}>
            <a
              href={"https://donate.stripe.com/7sI16Z1jYdo698I9AC"}
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              Donate
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

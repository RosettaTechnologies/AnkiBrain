import "./BottomNav.css";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router";
import { useState } from "react";
import { PATHS } from "../../api/constants";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import { IoHelpCircleOutline } from "react-icons/io5";
import { IoMdSettings } from "react-icons/io";

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colorMode } = useColorMode();
  const [showHelpModal, setShowHelpModal] = useState(false);

  const navItems = [
    { path: PATHS.TOPIC_EXPLANATION, icon: "bi bi-book", label: "Explain" },
    { path: PATHS.MAKE_CARDS, icon: "bi bi-stack", label: "Make Cards" },
    { path: PATHS.TALK, icon: "bi bi-chat-fill", label: "Talk" },
    { path: PATHS.IMPORT, icon: "bi bi-folder", label: "Import" },
    { path: PATHS.SETTINGS, icon: "settings", label: "Settings" },
    { path: "help", icon: "help", label: "Help" },
  ];

  const isActive = (path) => {
    if (path === "help") return false;
    return location.pathname === path;
  };

  return (
    <>
      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
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
            </Text>
            <Text mt={3}>
              You can also visit{" "}
              <a href={"https://www.reddit.com/r/ankibrain"}>
                https://www.reddit.com/r/ankibrain/
              </a>
            </Text>
          </ModalBody>
        </ModalContent>
      </Modal>

      <div className="BottomNav">
        {navItems.map((item) => (
          <div
            key={item.label}
            className={`BottomNav-item ${isActive(item.path) ? "active" : ""}`}
            onClick={() => {
              if (item.path === "help") {
                setShowHelpModal(true);
              } else {
                navigate(item.path);
              }
            }}
          >
            {item.icon === "settings" ? (
              <IoMdSettings size={20} />
            ) : item.icon === "help" ? (
              <IoHelpCircleOutline size={20} />
            ) : (
              <i className={item.icon}></i>
            )}
            <span className="BottomNav-label">{item.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setShowLoginModal } from "../../api/redux";
import { login, signup } from "../../api/user";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Tag,
  Text,
} from "@chakra-ui/react";
import { errorToast, infoToast } from "../../api/toast";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { getAPIEndpoints } from "../../api/server-api/networking";
import { useNavigate } from "react-router-dom";
import { PATHS } from "../../api/constants";

export function LoginModal(props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupMode, setSignupMode] = useState(false);
  const [agreedPP, setAgreedPP] = useState(false);
  const [agreedTOS, setAgreedTOS] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const devMode = useSelector((state) => state.devMode.value);
  const [privacyPolicyLink, setPrivacyPolicyLink] = useState(
    getAPIEndpoints().PRIVACY_POLICY
  );
  const [termsOfServiceLink, setTermsOfServiceLink] = useState(
    getAPIEndpoints().TERMS_OF_SERVICE
  );

  useEffect(() => {
    setPrivacyPolicyLink(getAPIEndpoints().PRIVACY_POLICY);
    setTermsOfServiceLink(getAPIEndpoints().TERMS_OF_SERVICE);
  }, [devMode]);

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={() => {
        dispatch(setShowLoginModal(false));
      }}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {signupMode && (
            <div>
              <Button
                me={3}
                onClick={() => {
                  setSignupMode(false);
                }}
              >
                <ArrowBackIcon fontSize={28} />
              </Button>
            </div>
          )}
          {signupMode ? "Sign Up" : "Login or Sign Up"}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (signupMode) {
                if (!agreedPP || !agreedTOS) {
                  infoToast(
                    "Info",
                    "Please agree to both the Privacy Policy and Terms of Service before registering."
                  );
                  return;
                }
                if (password !== confirmPassword) {
                  errorToast(
                    "Passwords do not match",
                    "Make sure your password and password confirmation match."
                  );
                } else {
                  await signup(email, password);
                }
              } else {
                await login(email, password);
              }
            }}
          >
            <div className="mb-3">
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <Input
                type="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </div>
            <div className="mb-3">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <Input
                type="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </div>

            {signupMode && (
              <div className={"mb-3"}>
                <label htmlFor="password" className="form-label">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                  }}
                />
              </div>
            )}

            {!signupMode && (
              <Button type={"submit"} variant={"accent"}>
                Login
              </Button>
            )}

            {signupMode && (
              <Flex direction={"column"} mt={5}>
                <Checkbox
                  isChecked={agreedPP}
                  onChange={(e) => {
                    setAgreedPP(e.target.checked);
                  }}
                >
                  I have read and agree to the{" "}
                  <Link color={"teal.500"} isExternal>
                    <a
                      href={privacyPolicyLink}
                      target={"_blank"}
                      style={{ width: "100%", height: "100%" }}
                    >
                      Privacy Policy ({privacyPolicyLink})
                    </a>
                  </Link>
                </Checkbox>
                <Checkbox
                  mb={5}
                  isChecked={agreedTOS}
                  onChange={(e) => {
                    setAgreedTOS(e.target.checked);
                  }}
                >
                  I have read and agree to the{" "}
                  <Link color={"teal.500"} isExternal>
                    <a
                      href={termsOfServiceLink}
                      target={"_blank"}
                      style={{ width: "100%", height: "100%" }}
                    >
                      Terms of Service ({termsOfServiceLink})
                    </a>
                  </Link>
                </Checkbox>
                <Button type="submit" variant={"accent"}>
                  Confirm
                </Button>
              </Flex>
            )}
          </form>
          <div className="modal-body">
            {!signupMode && (
              <>
                <Divider />

                <Box>
                  <Tag>OR</Tag>
                </Box>
              </>
            )}
            {!signupMode && (
              <Button
                variant={"secondary"}
                mt={5}
                onClick={() => {
                  setSignupMode(true);
                }}
              >
                Sign Up
              </Button>
            )}
          </div>
          <Flex direction={"column"} alignSelf={"center"} mt={5} mb={5}>
            <Text>Forgot password?</Text>
            <Button
              onClick={() => {
                dispatch(setShowLoginModal(false));
                navigate(PATHS.SETTINGS);
              }}
            >
              Reset my password
            </Button>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => {
              dispatch(setShowLoginModal(false));
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

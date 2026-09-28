import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  CloseButton,
  Flex,
  Popover,
  PopoverAnchor,
  PopoverBody,
  PopoverContent,
  Spacer,
  Tag,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PATHS } from "../../../api/constants";
import { useDispatch } from "react-redux";
import { setMakeCardsText } from "../../../api/redux/slices/makeCardsText";

export const AIMessage = (props) => {
  const [showPopover, setShowPopover] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { colorMode } = useColorMode();

  return (
    <Popover isOpen={showPopover} placement={"bottom-end"}>
      <Box
        className={"TalkScreenMessage AIMessage"}
        bg={colorMode === "light" ? "white" : "#91ddec"}
        color={"customBlack"}
        style={{
          position: "relative",
          alignSelf: "flex-start",
          marginLeft: 15,
          marginRight: 0,
          marginTop: 15,
          marginBottom: 15,
          paddingTop: 5,
        }}
        key={props.key}
        css={{
          overflowWrap: "break-word",
          hyphens: "auto",
          wordBreak: "break-word",
        }}
      >
        <i
          className={"bi bi-robot"}
          style={{
            width: 50,
            height: 50,
            fontSize: 36,
            marginRight: 5,
            justifyContent: "center",
            alignItems: "center",
            display: "flex",
            color: "var(--color-text)",
          }}
        />

        <Flex direction={"column"}>
          <Text style={{ textAlign: "center" }}>{props.messageData.text}</Text>
          {props.messageData.sourceSnippets &&
            props.messageData.sourceSnippets.length > 0 && (
              <Accordion allowToggle mt={2}>
                <AccordionItem>
                  <AccordionButton>
                    <Tag
                      color={colorMode === "light" ? "customBlack" : "white"}
                      bg={colorMode === "light" ? "offWhite" : "#16161d"}
                    >
                      Source Document Snippets
                    </Tag>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel>
                    {props.messageData.sourceSnippets.map((sourceStr) => (
                      <Box
                        p={3}
                        mb={3}
                        color={colorMode === "light" ? "customBlack" : "white"}
                        bg={colorMode === "light" ? "offWhite" : "customBlack"}
                        borderRadius={5}
                      >
                        <Text mt={2}>
                          {sourceStr.endsWith(".")
                            ? sourceStr
                            : sourceStr + "..."}
                        </Text>
                      </Box>
                    ))}
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            )}

          <Flex direction={"row"} justifyContent={"center"}>
            <Text fontSize={10} color={"gray"} me={2.5}>
              Model: {props.messageData.model}
            </Text>
            <Text fontSize={10} color={"gray"}>
              Temperature: {props.messageData.temperature}
            </Text>
          </Flex>
        </Flex>

        <PopoverAnchor>
          <Box
            ms={5}
            className={"ShareButton"}
            onClick={() => {
              setShowPopover(true);
            }}
          >
            <i className={"bi bi-share-fill"}></i>
          </Box>
        </PopoverAnchor>
      </Box>

      <PopoverContent width={250}>
        <PopoverBody>
          <Flex direction={"row"}>
            <Button
              variant={"accent"}
              onClick={() => {
                setShowPopover(false);
                dispatch(setMakeCardsText(props.messageData.text));
                navigate(PATHS.MAKE_CARDS);
              }}
            >
              Send to Make Cards
            </Button>
            <Spacer />
            <CloseButton
              size={"sm"}
              onClick={() => {
                setShowPopover(false);
              }}
            />
          </Flex>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

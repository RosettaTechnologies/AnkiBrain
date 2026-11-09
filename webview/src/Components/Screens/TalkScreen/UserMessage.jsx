
import { Box, useColorMode } from "@chakra-ui/react";
import MarkdownRenderer from "./MarkdownRenderer";

export const UserMessage = (props) => {
  const { colorMode } = useColorMode();

  return (
    <Box
      className={"TalkScreenMessage UserMessage"}
      bg={colorMode === "light" ? "white" : "accent"}
      color={"customBlack"}
      style={{
        alignSelf: "flex-end",
        marginLeft: 15,
        marginRight: 15,
        marginTop: 15,
        marginBottom: 15,
        paddingTop: 5,
        width: "calc(100% - 30px)",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
      key={props.key}
      css={{
        overflowWrap: "break-word",
        hyphens: "auto",
        wordBreak: "break-word",
      }}
    >
      <i
        className={"bi bi-person-fill"}
        style={{
          width: 50,
          height: 50,
          fontSize: 36,
          justifyContent: "center",
          alignItems: "center",
          display: "flex",
          color: "var(--color-text)",
        }}
      ></i>

      <Box flex={1} minWidth={0} width="100%">
        <MarkdownRenderer content={props.messageData.text} />
      </Box>
    </Box>
  );
};

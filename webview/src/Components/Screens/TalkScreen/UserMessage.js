import { Box, Text, useColorMode } from "@chakra-ui/react";

export const UserMessage = (props) => {
  const { colorMode } = useColorMode();
  return (
    <Box
      className={"TalkScreenMessage UserMessage"}
      bg={colorMode === "light" ? "white" : "accent"}
      color={"customBlack"}
      style={{
        alignSelf: "flex-end",
        marginLeft: 0,
        marginRight: 15,
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

      <Text style={{ textAlign: "center" }}>{props.messageData.text}</Text>
    </Box>
  );
};

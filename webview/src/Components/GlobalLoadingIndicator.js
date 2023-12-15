import { Box, CircularProgress, Flex, Spacer, Text } from "@chakra-ui/react";
import React from "react";
import { useSelector } from "react-redux";
import "@fontsource/lato/400.css";

export function GlobalLoadingIndicator(props) {
  const show = useSelector((state) => state.bGlobalLoadingIndicator.value);
  const loadingText = useSelector((state) => state.loadingText.value);
  return (
    <>
      {show && (
        <Box
          id={"GlobalLoadingIndicator"}
          position={"absolute"}
          zIndex={1000}
          alignSelf={"center"}
          top={"35%"}
        >
          <Flex
            direction={"column"}
            alignItems={"center"}
            justifyContent={"center"}
          >
            <Text fontFamily={"lato"} fontSize={36}>
              AnkiBrain
            </Text>
            <Spacer />
            <Text fontFamily={"sans-serif"} fontSize={24} color={"gray"}>
              {loadingText}
            </Text>
          </Flex>
          <CircularProgress
            isIndeterminate={true}
            color={"accent"}
          ></CircularProgress>
        </Box>
      )}
    </>
  );
}

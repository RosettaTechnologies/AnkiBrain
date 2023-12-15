import { createStandaloneToast } from "@chakra-ui/react";

const { toast } = createStandaloneToast();

export function successToast(
  title = "Success",
  message = "",
  duration = 10000
) {
  toast({
    title,
    description: message,
    status: "success",
    duration,
    isClosable: true,
  });
}

export function errorToast(title = "Error", message = "", duration = 10000) {
  toast({
    title,
    description: message,
    status: "error",
    duration,
    isClosable: true,
  });
}

export function infoToast(title = "Info", message = "", duration = 10000) {
  toast({
    title,
    description: message,
    status: "info",
    duration,
    isClosable: true,
  });
}

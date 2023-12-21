import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Heading,
  Spacer,
  Spinner,
  Tag,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { AddIcon, DeleteIcon } from "@chakra-ui/icons";
import { useDispatch, useSelector } from "react-redux";
import "./ImportScreen.css";
import { deleteAllDocuments, importDocuments } from "../../../api/documents";
import { isLocalMode } from "../../../api/user";
import { infoToast } from "../../../api/toast";
import { setDocuments } from "../../../api/redux/slices/documentsSlice";

export function ImportScreen(props) {
  let importedDocs = useSelector((state) => state.documents.value);
  let user = useSelector((state) => state.user.value);

  useEffect(() => {
    if (user) {
      dispatch(setDocuments(user.documentsStored));
    }
  }, [user]);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const deleteAlertCancelRef = useRef();
  const documentsLoading = useSelector((state) => state.documentsLoading.value);
  const dispatch = useDispatch();
  const { colorMode } = useColorMode();

  const DeleteDocumentAlert = (props) => {
    return (
      <AlertDialog
        isOpen={showDeleteAlert}
        leastDestructiveRef={deleteAlertCancelRef}
        onClose={props.onCancel}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader>Delete Document</AlertDialogHeader>
            <AlertDialogBody>
              Are you sure? This will delete all of documents in AnkiBrain. Your
              originals will NOT be deleted.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={deleteAlertCancelRef} onClick={props.onCancel}>
                Cancel
              </Button>
              <Button colorScheme={"red"} onClick={props.onOK}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    );
  };

  // Server mode but no user added.
  if (!isLocalMode() && !user) {
    return <Text>This screen is unavailable until you log in.</Text>;
  }

  return (
    <Box {...props}>
      <Box ms={5}>
        <DeleteDocumentAlert
          onCancel={() => {
            setShowDeleteAlert(false);
          }}
          onOK={async () => {
            await deleteAllDocuments();
            setShowDeleteAlert(false);
          }}
        />

        <Flex mb={5} direction={"column"} p={0}>
          <Flex color={"gray"} fontSize={14} direction={"column"} mb={5}>
            <Text p={0} m={0}>
              Import your documents here for AI analysis.
            </Text>
            <Text fontSize={14} color={"gray"} p={0} m={0}>
              When you check the "Use Documents" option, these documents will be
              used when you chat with the AI or ask for a topic explanation.
            </Text>
            {!isLocalMode() && (
              <Text fontSize={12} color={"gray"} p={0} m={0} mt={1}>
                Monthly storage cost is approx. $0.014 per 2,000 words.
              </Text>
            )}
          </Flex>

          <Flex direction={"row"} alignSelf={"center"}>
            <Flex direction={"column"} me={5}>
              <Button
                variant={"accent"}
                onClick={async () => {
                  await importDocuments(dispatch);
                }}
              >
                <AddIcon me={2} fontSize={"sm"} />
                Import Documents
              </Button>
              <Text fontSize={12} color={"gray"}>
                Max {isLocalMode() ? "1 GB" : "100 MB"} per file. Supported
                document types: PDF, DOCX, TXT, PPTX, HTML
              </Text>
            </Flex>

            <Button
              me={5}
              onClick={() => {
                setShowDeleteAlert(true);
              }}
              isDisabled={user.documentsStored.length === 0}
            >
              <DeleteIcon fontSize={"sm"} me={2} />
              Delete Documents
            </Button>
          </Flex>
        </Flex>

        {documentsLoading && (
          <Flex justifyContent={"center"} alignItems={"center"}>
            <Spinner color={"accent"} />
          </Flex>
        )}
        {!documentsLoading && (
          <Box maxHeight={1000} overflowY={"scroll"}>
            {user.documentsStored.map((doc, i) => (
              <Card
                mt={5}
                mb={5}
                me={5}
                p={3}
                backgroundColor={
                  colorMode === "light"
                    ? "rgba(0, 0, 0, 0.05)"
                    : "customPurple.700"
                }
                key={i}
              >
                <CardHeader>
                  <Flex direction={"row"}>
                    <Heading fontSize={"md"}>Document</Heading>
                    <Spacer />
                    <Tag colorScheme={"green"}>ENABLED</Tag>
                  </Flex>
                </CardHeader>

                <CardBody>
                  <Flex direction={"column"} alignItems={"start"}>
                    <Flex direction={"column"} alignItems={"start"}>
                      <Heading fontSize={"sm"}>Name</Heading>
                      <Text>
                        {doc.file_name + (doc.extension ? doc.extension : "")}{" "}
                        {/*Server doc.file_name has extension in it but python layer doesn't*/}
                      </Text>
                    </Flex>

                    <Flex direction={"column"} alignItems={"start"}>
                      <Heading fontSize={"sm"}>Size</Heading>
                      <Text>{(doc.size / 1024 / 1024).toFixed(2)} MB</Text>
                    </Flex>

                    {doc.path && (
                      <Flex direction={"column"} alignItems={"start"}>
                        <Heading fontSize={"sm"}>Path</Heading>
                        <Text>{doc.path}</Text>
                      </Flex>
                    )}
                  </Flex>
                </CardBody>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

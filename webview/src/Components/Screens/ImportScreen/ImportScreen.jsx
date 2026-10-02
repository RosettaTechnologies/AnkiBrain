import { useEffect, useState } from "react";
import {
  IonAlert,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonIcon,
  IonSpinner,
} from "@ionic/react";
import { add, trashOutline } from "ionicons/icons";
import { useDispatch, useSelector } from "react-redux";
import "./ImportScreen.css";
import { deleteAllDocuments, importDocuments } from "../../../api/documents";
import { isLocalMode } from "../../../api/user";
import { setDocuments } from "../../../api/redux/slices/documentsSlice";

export function ImportScreen() {
  let user = useSelector((state) => state.user.value);

  const dispatch = useDispatch();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const documentsLoading = useSelector((state) => state.documentsLoading.value);

  useEffect(() => {
    if (user) {
      dispatch(setDocuments(user.documentsStored));
    }
  }, [user]);

  // Server mode but no user added.
  if (!isLocalMode() && user === null) {
    return <p>This screen is unavailable until you log in.</p>;
  }

  return (
    <div className="ImportScreen">
      <IonAlert
        isOpen={showDeleteAlert}
        header="Delete Document"
        message="Are you sure? This will delete all of documents in AnkiBrain. Your originals will NOT be deleted."
        buttons={[
          {
            text: "Cancel",
            role: "cancel",
            handler: () => setShowDeleteAlert(false),
          },
          {
            text: "Delete",
            role: "destructive",
            handler: async () => {
              await deleteAllDocuments();
              setShowDeleteAlert(false);
            },
          },
        ]}
        onDidDismiss={() => setShowDeleteAlert(false)}
      />

      <div className="ImportScreen-intro">
        <p>Import your documents here for AI analysis.</p>
        <p>
          When you check the "Use Documents" option, these documents will be
          used when you chat with the AI or ask for a topic explanation.
        </p>
        {!isLocalMode() && (
          <p className="ImportScreen-small">
            Monthly storage cost is approx. $0.014 per 2,000 words.
          </p>
        )}
      </div>

      <div className="ImportScreen-actions">
        <div className="ImportScreen-importBlock">
          <IonButton
            color="accent"
            onClick={async () => {
              await importDocuments(dispatch);
            }}
          >
            <IonIcon slot="start" icon={add} />
            Import Documents
          </IonButton>
          <p className="ImportScreen-small">
            Max {isLocalMode() ? "1 GB" : "100 MB"} per file. Supported document
            types: PDF, DOCX, TXT, PPTX, HTML
          </p>
        </div>

        <IonButton
          fill="outline"
          disabled={user !== null && user.documentsStored.length === 0}
          onClick={() => {
            setShowDeleteAlert(true);
          }}
        >
          <IonIcon slot="start" icon={trashOutline} />
          Delete Documents
        </IonButton>
      </div>

      {documentsLoading && (
        <div className="ImportScreen-loading">
          <IonSpinner name="circular" />
        </div>
      )}

      {user !== null && !documentsLoading && (
        <div className="ImportScreen-docList">
          {user.documentsStored.map((doc, i) => (
            <IonCard className="ImportScreen-docCard" key={i}>
              <IonCardHeader>
                <div className="ImportScreen-docHeader">
                  <h3>Document</h3>
                  <IonBadge color="success">ENABLED</IonBadge>
                </div>
              </IonCardHeader>

              <IonCardContent>
                <div className="ImportScreen-docField">
                  <h4>Name</h4>
                  <span>
                    {doc.file_name + (doc.extension ? doc.extension : "")}{" "}
                    {/*Server doc.file_name has extension in it but python layer doesn't*/}
                  </span>
                </div>

                <div className="ImportScreen-docField">
                  <h4>Size</h4>
                  <span>{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>

                {doc.path && (
                  <div className="ImportScreen-docField">
                    <h4>Path</h4>
                    <span>{doc.path}</span>
                  </div>
                )}
              </IonCardContent>
            </IonCard>
          ))}
        </div>
      )}
    </div>
  );
}

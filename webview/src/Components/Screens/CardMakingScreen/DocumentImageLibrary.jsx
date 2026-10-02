import { useState } from "react";
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { add, trash } from "ionicons/icons";
import "./DocumentImageLibrary.css";
import { cardSnippet } from "./EditableCard";

/*
 * "Images found in your document" panel.
 *
 * Shows every image extracted from the processed document (imagesRegistry).
 * Clicking a thumbnail opens a preview where the image can be inserted into
 * one or more cards — the same ids the generation pipeline auto-attaches, so
 * manually placed images flow through ADD_CARDS unchanged.
 *
 * compact=true renders it as a narrow side panel: single-column list with
 * larger thumbnails and a sticky header (the panel itself scrolls).
 * "Clear All" empties the library via the parent's onClearAll (which also
 * detaches the images from pending cards).
 */
export function DocumentImageLibrary(props) {
  const {
    images,
    usageCounts = {},
    cards = [],
    onInsert,
    onClearAll,
    compact = false,
  } = props;
  const [previewImageId, setPreviewImageId] = useState(null);

  const previewImage = previewImageId
    ? images.find((image) => image.id === previewImageId) || null
    : null;

  return (
    <div className="DocumentImageLibrary">
      <div
        className={
          "DocumentImageLibrary-header" +
          (compact ? " DocumentImageLibrary-header--sticky" : "")
        }
      >
        <h4 className="DocumentImageLibrary-title">
          Images found in your document ({images.length})
        </h4>
        {images.length > 0 && (
          <div className="DocumentImageLibrary-clearRow">
            <IonButton size="small" color="light" onClick={onClearAll}>
              <IonIcon slot="start" icon={trash} />
              Clear All
            </IonButton>
          </div>
        )}
      </div>

      {images.length === 0 ? (
        <p className="DocumentImageLibrary-empty">
          No images have been found yet. Process a document and AnkiBrain will
          collect every image embedded in it here — you can then insert them
          into cards before adding the cards to Anki.
        </p>
      ) : (
        <div
          className={
            "DocumentImageLibrary-grid" +
            (compact ? " DocumentImageLibrary-grid--compact" : "")
          }
        >
          {images.map((image) => {
            const usedOn = usageCounts[image.id] || 0;
            return (
              <button
                key={image.id}
                type="button"
                className="DocumentImageLibrary-card"
                onClick={() => setPreviewImageId(image.id)}
              >
                <div className="DocumentImageLibrary-thumbWrap">
                  <img
                    src={image.url}
                    alt={image.id}
                    className={
                      "DocumentImageLibrary-thumb" +
                      (compact ? " DocumentImageLibrary-thumb--compact" : "")
                    }
                  />
                  {usedOn > 0 && (
                    <IonBadge
                      className="DocumentImageLibrary-badge"
                      color="success"
                    >
                      {usedOn} card{usedOn === 1 ? "" : "s"}
                    </IonBadge>
                  )}
                </div>
                <span className="DocumentImageLibrary-anchor">
                  {image.anchorChunk !== null && image.anchorChunk !== undefined
                    ? `section ~${image.anchorChunk}`
                    : "unanchored"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <IonModal
        isOpen={previewImage !== null}
        onDidDismiss={() => setPreviewImageId(null)}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Insert image into a card</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setPreviewImageId(null)}>
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          {previewImage && (
            <div className="DocumentImageLibrary-preview">
              <div className="DocumentImageLibrary-previewBox">
                <img
                  src={previewImage.url}
                  alt={previewImage.id}
                  className="DocumentImageLibrary-previewImg"
                />
              </div>

              {cards.length === 0 ? (
                <p className="DocumentImageLibrary-empty">
                  No cards yet — generate cards from your document first, then
                  come back to insert this image into them.
                </p>
              ) : (
                <>
                  <p className="DocumentImageLibrary-empty">
                    Pick a card below. You can insert into as many as you like,
                    then close this dialog.
                  </p>
                  <div className="DocumentImageLibrary-cardList">
                    {cards.map((card, cardIndex) => {
                      const alreadyOn = (card.images || []).includes(
                        previewImage.id
                      );
                      return (
                        <div
                          className="DocumentImageLibrary-cardRow"
                          key={cardIndex}
                        >
                          <span className="DocumentImageLibrary-cardSnippet">
                            {cardIndex + 1}. {cardSnippet(card)}
                          </span>
                          <IonButton
                            size="small"
                            color="light"
                            disabled={alreadyOn}
                            onClick={() =>
                              onInsert(previewImage.id, cardIndex)
                            }
                          >
                            {alreadyOn ? (
                              <IonBadge color="success">Inserted</IonBadge>
                            ) : (
                              <>
                                <IonIcon slot="start" icon={add} />
                                Insert
                              </>
                            )}
                          </IonButton>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </IonContent>
      </IonModal>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { checkmark } from "ionicons/icons";
import "./ImagePickerModal.css";

/*
 * Card-centric image picker: a grid of every image found in the user's
 * documents (imagesRegistry), pre-checked for the ones already on this card.
 * Manual adds are uncapped by design — MAX_IMAGES_PER_CARD only limits the
 * automatic attachment that happens during generation.
 *
 * onConfirm receives the card's full new image-id list: images the picker
 * never displayed (e.g. ids purged from media_tmp) are preserved untouched.
 */
export function ImagePickerModal(props) {
  const { isOpen, onClose, images, currentImages = [], usageCounts = {}, onConfirm } =
    props;
  const [selected, setSelected] = useState([]);

  // Re-seed the checkboxes every time the modal opens on a card.
  useEffect(() => {
    if (isOpen) {
      setSelected([...currentImages]);
    }
  }, [isOpen]);

  const toggle = (id) => {
    setSelected((sel) =>
      sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]
    );
  };

  const handleConfirm = () => {
    const shownIds = new Set(images.map((image) => image.id));
    const kept = currentImages.filter(
      (id) => !shownIds.has(id) || selected.includes(id)
    );
    const added = selected.filter((id) => !currentImages.includes(id));
    onConfirm([...kept, ...added]);
    onClose();
  };

  const newCount = selected.filter((id) => !currentImages.includes(id)).length;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Add images to this card</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {images.length === 0 ? (
          <p className="ImagePickerModal-empty">
            No images found yet. Process a document on the "From Documents"
            tab and AnkiBrain will collect the images inside it.
          </p>
        ) : (
          <div className="ImagePickerModal-grid">
            {images.map((image) => {
              const isSelected = selected.includes(image.id);
              const usedOn = usageCounts[image.id] || 0;
              return (
                <button
                  key={image.id}
                  type="button"
                  className={
                    "ImagePickerModal-card" +
                    (isSelected ? " ImagePickerModal-card--selected" : "")
                  }
                  onClick={() => toggle(image.id)}
                >
                  <div className="ImagePickerModal-thumbWrap">
                    <img
                      src={image.url}
                      alt={image.id}
                      className="ImagePickerModal-thumb"
                    />
                    {isSelected && (
                      <span className="ImagePickerModal-check">
                        <IonIcon icon={checkmark} />
                      </span>
                    )}
                  </div>
                  <span className="ImagePickerModal-anchor">
                    {image.anchorChunk !== null &&
                    image.anchorChunk !== undefined
                      ? `section ~${image.anchorChunk}`
                      : "unanchored"}{" "}
                    · on {usedOn} card{usedOn === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButtons slot="end">
            <IonButton fill="clear" onClick={onClose}>
              Cancel
            </IonButton>
            <IonButton color="accent" onClick={handleConfirm}>
              {newCount > 0 ? `Apply (${newCount} new)` : "Apply"}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}

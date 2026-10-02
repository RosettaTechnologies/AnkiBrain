import { useState } from "react";
import { cloneDeep } from "lodash";
import { useSelector } from "react-redux";
import {
  IonBadge,
  IonButton,
  IonIcon,
  IonInput,
  IonSpinner,
  IonTextarea,
} from "@ionic/react";
import { add, close, trash, volumeHighOutline } from "ionicons/icons";
import "./EditableCard.css";
import {
  cancelFieldAudio,
  requestFieldAudio,
} from "../../../api/cardAudio";
import { playTtsUrl } from "../../../api/tts/player";
import { infoToast } from "../../../api/toast";

const NO_FIELDS = {};

export function cardSnippet(card) {
  const text =
    card.type === "cloze" ? card.text || "" : card.front || card.text || "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 64 ? flat.slice(0, 64) + "…" : flat || "(empty card)";
}

/*
 * One reviewable, editable card in the Make Cards review list.
 *
 * Editing model: every change goes through modifyCard(index, fn), which the
 * CardMakingScreen uses to update the redux `cards` list (persisted back to
 * python's tempCards setting on a debounce). Images are referenced by their
 * media_tmp ids; the webview previews them via file:// urls from
 * imagesRegistry, and ADD_CARDS resolves the ids to bytes at import time.
 *
 * Audio follows the same id pattern: card.audio maps field ('front'|'back';
 * cloze cards only ever have 'back' — its resolved-sentence clip rides on the
 * answer side) to a media_tmp tts id. Clips are synthesized on demand — the
 * per-field button here, Apply-to-all, or mode auto-enqueue — never inline
 * during "Add to Anki". Synthesis state (spinner / error / cancel marks)
 * lives in the cardAudio redux slice, addressed by this card's uid.
 *
 * Manual image adds are intentionally uncapped — the MAX_IMAGES_PER_CARD
 * limit only governs automatic attachment during generation.
 */
export function EditableCard(props) {
  const { card, index, imagesById, modifyCard, onDelete, onOpenImagePicker } =
    props;
  const [newTag, setNewTag] = useState("");

  const generating = useSelector(
    (s) => (card.uid && s.cardAudio.generating[card.uid]) || NO_FIELDS
  );
  const errors = useSelector(
    (s) => (card.uid && s.cardAudio.errors[card.uid]) || NO_FIELDS
  );
  const audioById = useSelector((s) => s.audioRegistry.value);

  const setField = (field, value) => {
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      cardCopy[field] = value;
      // A spoken clip only matches the text it was synthesized from, so
      // editing invalidates it: the field drops back to "no audio" and can
      // be regenerated (button, Apply-to-all, or mode auto-enqueue).
      const audioField = field === "text" ? "back" : field;
      if (cardCopy.audio && cardCopy.audio[audioField] !== undefined) {
        const audio = { ...cardCopy.audio };
        delete audio[audioField];
        cardCopy.audio = audio;
      }
      return cardCopy;
    });
  };

  const removeImage = (imageId) => {
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      cardCopy.images = (cardCopy.images || []).filter((id) => id !== imageId);
      return cardCopy;
    });
  };

  const removeFieldAudio = (field) => {
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      if (cardCopy.audio) {
        const audio = { ...cardCopy.audio };
        delete audio[field];
        cardCopy.audio = audio;
      }
      return cardCopy;
    });
  };

  const playFieldAudio = (field) => {
    const id = (card.audio || {})[field];
    const entry = id ? audioById[id] : null;
    if (!entry || !entry.url) {
      infoToast(
        "Audio Unavailable",
        "This clip's file was cleaned up. Remove it and generate again."
      );
      return;
    }
    playTtsUrl(entry.url, cardSnippet(card));
  };

  const handleAddTag = () => {
    const value = newTag.trim();
    if (value === "" || value.includes(" ")) {
      return;
    }
    modifyCard(index, (c) => {
      const cardCopy = cloneDeep(c);
      if (!cardCopy.tags.includes(value)) {
        cardCopy.tags.push(value);
      }
      return cardCopy;
    });
    setNewTag("");
  };

  const cardImages = card.images || [];
  const hasFinalizedAudio = !!(
    (card.audio || {}).front || (card.audio || {}).back
  );

  /*
   * Per-field audio controls, sitting right-aligned in the field's heading.
   * Three states mirror the image pattern: generate (or retry after an
   * error) → spinner + cancel while in flight → play + remove once attached.
   * With the voice engine missing, "generate" just opens the setup dialog;
   * the job is not replayed afterwards — the user clicks again.
   */
  const fieldAudioControl = (field, label) => {
    if (!card.uid) {
      return null;
    }

    if (generating[field]) {
      return (
        <span className="EditableCard-audioControl">
          <IonSpinner name="crescent" className="EditableCard-audioSpinner" />
          <span className="EditableCard-audioText">{label} audio</span>
          <IonButton
            size="small"
            fill="clear"
            color="danger"
            onClick={() => cancelFieldAudio(card.uid, field)}
          >
            Cancel
          </IonButton>
        </span>
      );
    }

    const audioId = (card.audio || {})[field];
    if (audioId) {
      const entry = audioById[audioId];
      return (
        <span className="EditableCard-audioControl">
          {entry && entry.url ? (
            <IonButton
              size="small"
              fill="clear"
              aria-label={`Play ${label} audio`}
              onClick={() => playFieldAudio(field)}
            >
              <IonIcon slot="icon-only" icon={volumeHighOutline} />
            </IonButton>
          ) : (
            <span className="EditableCard-audioText">audio unavailable</span>
          )}
          <IonButton
            size="small"
            fill="clear"
            color="danger"
            aria-label={`Remove ${label} audio`}
            onClick={() => removeFieldAudio(field)}
          >
            <IonIcon slot="icon-only" icon={close} />
          </IonButton>
        </span>
      );
    }

    const error = errors[field];
    return (
      <IonButton
        size="small"
        fill="clear"
        color={error ? "warning" : "medium"}
        title={error || undefined}
        onClick={() => requestFieldAudio(card, field)}
      >
        <IonIcon slot="start" icon={volumeHighOutline} />
        {error ? "Retry audio" : "Add audio"}
      </IonButton>
    );
  };

  return (
    <div className="EditableCard">
      <div className="EditableCard-main">
        <div className="EditableCard-headerRow">
          <span className="EditableCard-typeTag">
            {index + 1} · {card.type}
          </span>

          {/* Card-level audio indicator: a plain "audio" label once the
              card has at least one finalized clip. In-flight jobs show
              only their per-field spinner (with that field's Cancel) —
              no second cancel affordance here. */}
          {hasFinalizedAudio && (
            <IonBadge className="EditableCard-audioBadge" color="success">
              <IonIcon icon={volumeHighOutline} />
              audio
            </IonBadge>
          )}

          <span className="EditableCard-spacer" />
          <IonButton
            size="small"
            fill="clear"
            color="danger"
            onClick={() => onDelete(index)}
          >
            <IonIcon slot="start" icon={trash} />
            Delete
          </IonButton>
        </div>

        {card.type === "cloze" ? (
          <div className="EditableCard-field">
            <div className="EditableCard-fieldHeader">
              <span className="EditableCard-fieldLabel">
                Cloze text (deletions look like {"{{c1::answer}}"})
              </span>
              <span className="EditableCard-spacer" />
              {fieldAudioControl("back", "answer")}
            </div>
            <IonTextarea
              className="EditableCard-textarea"
              fill="solid"
              autoGrow={true}
              value={card.text || ""}
              onIonInput={(e) => setField("text", e.detail.value || "")}
            />
          </div>
        ) : (
          <>
            <div className="EditableCard-field">
              <div className="EditableCard-fieldHeader">
                <span className="EditableCard-fieldLabel">Front</span>
                <span className="EditableCard-spacer" />
                {fieldAudioControl("front", "front")}
              </div>
              <IonTextarea
                className="EditableCard-textarea"
                fill="solid"
                autoGrow={true}
                value={card.front || ""}
                onIonInput={(e) => setField("front", e.detail.value || "")}
              />
            </div>
            <div className="EditableCard-field">
              <div className="EditableCard-fieldHeader">
                <span className="EditableCard-fieldLabel">Back</span>
                <span className="EditableCard-spacer" />
                {fieldAudioControl("back", "back")}
              </div>
              <IonTextarea
                className="EditableCard-textarea"
                fill="solid"
                autoGrow={true}
                value={card.back || ""}
                onIonInput={(e) => setField("back", e.detail.value || "")}
              />
            </div>
          </>
        )}

        <div className="EditableCard-field">
          <div className="EditableCard-fieldHeader">
            <span className="EditableCard-fieldLabel">
              Images (answer side)
            </span>
            <span className="EditableCard-spacer" />
            <IonButton
              size="small"
              fill="outline"
              onClick={() => onOpenImagePicker(index)}
            >
              <IonIcon slot="start" icon={add} />
              Add image
            </IonButton>
          </div>

          {cardImages.length > 0 ? (
            <div className="EditableCard-images">
              {cardImages.map((imageId) => {
                const image = imagesById[imageId];
                return (
                  <div key={imageId} className="EditableCard-imageWrap">
                    {image ? (
                      <img
                        src={image.url}
                        alt={imageId}
                        className="EditableCard-image"
                      />
                    ) : (
                      <span className="EditableCard-unavailable">
                        image unavailable
                      </span>
                    )}
                    <IonButton
                      className="EditableCard-imageRemove"
                      size="small"
                      color="danger"
                      aria-label={"Remove image"}
                      onClick={(e) => {
                        e.preventDefault();
                        removeImage(imageId);
                      }}
                    >
                      <IonIcon slot="icon-only" icon={close} />
                    </IonButton>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="EditableCard-unavailable">
              No images on this card yet.
            </span>
          )}
        </div>

        <div className="EditableCard-tags">
          {card.tags.map((tag, tagIndex) => (
            <span className="EditableCard-tag" key={tag + tagIndex}>
              {tag}
              <IonIcon
                className="EditableCard-tagClose"
                icon={close}
                onClick={(e) => {
                  e.preventDefault();
                  modifyCard(index, () => {
                    let cardCopy = cloneDeep(card);
                    cardCopy.tags.splice(tagIndex, 1);
                    return cardCopy;
                  });
                }}
              />
            </span>
          ))}
          <IonInput
            className="EditableCard-tagInput"
            fill="solid"
            placeholder={"Add tag..."}
            value={newTag}
            onIonInput={(e) => setNewTag(e.detail.value || "")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddTag();
              }
            }}
          />
          <IonButton size="small" color="light" onClick={handleAddTag}>
            Add
          </IonButton>
        </div>
      </div>
    </div>
  );
}

import "./SideBar.css";
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { setShowLoginModal, store, updateUser } from "../../api/redux";
import { IonIcon, IonItem, IonLabel, IonList, IonPopover } from "@ionic/react";
import { moon, personCircle, sunny } from "ionicons/icons";
import { isLocalMode, logout } from "../../api/user";
import { errorToast, infoToast } from "../../api/toast";
import { postCreateCheckoutSession } from "../../api/server-api/networking/checkout";
import { setAppAlertModal } from "../../api/redux/slices/appAlertModal";
import { getAPIEndpoints } from "../../api/server-api/networking";
import { useColorMode } from "../../theme/colorMode";
import { FaStripe } from "react-icons/fa";
import { getUser } from "../../api/server-api/networking/user";

export function SideBar(props) {
  const user = useSelector((state) => state.user.value);
  const cost = useSelector((state) => state.cost);
  const userMode = useSelector((state) => state.userMode.value);
  const { colorMode, toggleColorMode } = useColorMode();
  const language = useSelector((state) => state.language.value);
  const dispatch = useDispatch();

  const currentVersion = useSelector((state) => state.currentVersion.value);

  let loggedIn = !!user;

  async function handleAddBalanceClick() {
    let res = await postCreateCheckoutSession(user.accessToken);
    if (res.status === "success") {
      let url = res.data.url;
      dispatch(
        setAppAlertModal({
          show: true,
          header: "Add Balance",
          alertText: (
            <div className="AddBalanceInfo">
              <h3 className="AddBalanceInfo-title">Pricing Information</h3>
              <p className="AddBalanceInfo-text">
                AnkiBrain Server Mode uses "pay as you go" pricing and aims to
                keep AnkiBrain as cheap as possible to make it accessible to all
                users across the world. Using GPT 5.6 Luna (default) is very
                cost-effective, and it is recommended for most users and most
                usage scenarios.
              </p>
              <p className="AddBalanceInfo-text">
                GPT 5.6 Luna (default) can generate <b>100 flashcards</b> for
                about <b>$0.03</b> on average.
              </p>
              <p className="AddBalanceInfo-text">
                $1.00 stores <b>2,850 pages</b> for one month.
              </p>
              <p className="AddBalanceInfo-text AddBalanceInfo-text--small">
                Storage only applies to documents imported via the Import tab,
                not to flashcards created in the Make Cards tab.
              </p>
              <p className="AddBalanceInfo-text AddBalanceInfo-text--small">
                Files stored in a vector database. See{" "}
                <a
                  href={getAPIEndpoints().PRIVACY_POLICY}
                  style={{ color: "blue" }}
                >
                  Privacy Policy
                </a>
              </p>
              <a className="AddBalanceInfo-cta" href={url}>
                <FaStripe size={48} style={{ marginRight: 7.5 }} />
                Add Balance
              </a>
            </div>
          ),
          onClose: async () => {
            let res = await getUser(store.getState().user.value.accessToken);
            if (res.status === "success") {
              infoToast(
                "Refreshing User Information...",
                "Refreshing your user information to reflect any added balance.",
                1000
              );
              dispatch(updateUser(res.data.user));
            }
          },
        })
      );
    }
  }

  return (
    <div className="TopHeader">
      <div className="TopHeader-left">
        <span className="TopHeader-brand">AnkiBrain</span>
        <span className="TopHeader-meta">
          v{currentVersion}
          {currentVersion < "1" ? " Beta" : ""}
        </span>
        {import.meta.env.VITE_APP_ENV === "DEV" && (
          <span className="TopHeader-meta">Dev</span>
        )}
        <span className="TopHeader-language">{language}</span>
        <button
          className="TopHeader-colorToggle"
          onClick={async (e) => {
            e.currentTarget.blur();
            await toggleColorMode();
          }}
        >
          <IonIcon icon={colorMode === "light" ? moon : sunny} size="small" />
        </button>
      </div>

      <div className="TopHeader-right">
        {!loggedIn && userMode === "SERVER" && (
          <button
            className="TopHeader-loginBtn"
            onClick={() => dispatch(setShowLoginModal(true))}
          >
            Login
          </button>
        )}

        {loggedIn && userMode === "SERVER" && (
          <>
            <div className="TopHeader-userInfo">
              <span className="TopHeader-userEmail">{user.email}</span>
              <span className="TopHeader-userBalance">
                ${user.balance.toFixed(2)}
              </span>
              <span className="TopHeader-userStorage">
                S: ${user.monthlyStorageCharge.toFixed(2)}
              </span>
            </div>
            <button
              className="TopHeader-addBalanceBtn"
              onClick={async () => {
                try {
                  if (store.getState().lockCheckoutSession.value) {
                    infoToast(
                      "Busy...",
                      "Please finish what you are doing before adding balance!"
                    );
                  } else {
                    await handleAddBalanceClick();
                  }
                } catch (err) {
                  errorToast("Error", err.message);
                }
              }}
            >
              Add Balance
            </button>
            <div className="TopHeader-profile">
              <IonIcon id="ProfileMenuTrigger" icon={personCircle} />
              <IonPopover
                trigger="ProfileMenuTrigger"
                triggerAction="click"
                dismissOnSelect
              >
                <IonList>
                  <IonItem
                    button
                    detail={false}
                    onClick={async () => {
                      await logout();
                    }}
                  >
                    <IonLabel>Logout</IonLabel>
                  </IonItem>
                </IonList>
              </IonPopover>
            </div>
          </>
        )}

        {userMode === "LOCAL" && (
          <span className="TopHeader-cost">${cost.session.toFixed(2)}</span>
        )}

        {isLocalMode() && (
          <a
            className="TopHeader-actionBtn"
            href={"https://donate.stripe.com/8x25kx8ZM7dx66RcMa7N600"}
          >
            Donate
          </a>
        )}
      </div>
    </div>
  );
}

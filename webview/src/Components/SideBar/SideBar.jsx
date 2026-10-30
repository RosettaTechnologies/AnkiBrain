import "./SideBar.css";
import { useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { Dropdown } from "bootstrap";
import { useDispatch, useSelector } from "react-redux";
import { setShowLoginModal } from "../../api/redux";
import { useColorMode } from "@chakra-ui/react";
import { isLocalMode, logout } from "../../api/user";
import { MdDarkMode } from "react-icons/md";
import { BsSunFill } from "react-icons/bs";
import { pyEditSetting } from "../../api/PythonBridge/senders/pyEditSetting";
import { setColorMode } from "../../api/redux/slices/colorMode";
import { getPlan } from "../../api/subscriptions";
import { BillingModal } from "../modals/BillingModal";

// Session cost for LOCAL mode. At least 4 decimals so a single request's
// sub-cent cost is visible instead of rounding to $0.00; extra digits when 4
// would still read as zero, so a nonzero cost never displays as 0.
function formatSessionCost(value) {
  const cost = Number(value) || 0;
  if (cost === 0) return "0.00";
  for (let digits = 4; digits <= 10; digits += 1) {
    const text = cost.toFixed(digits);
    if (Number(text) !== 0) return text;
  }
  return cost.toFixed(10);
}

export function SideBar(props) {
  const navigate = useNavigate();
  const user = useSelector((state) => state.user.value);
  const cost = useSelector((state) => state.cost);
  const userMode = useSelector((state) => state.userMode.value);
  const { colorMode, toggleColorMode } = useColorMode();
  const language = useSelector((state) => state.language.value);
  const dispatch = useDispatch();

  const storeColorMode = useSelector((state) => state.colorMode.value);
  useEffect(() => {
    if (!storeColorMode) return;
    if (storeColorMode !== colorMode) {
      toggleColorMode();
    }
  }, [storeColorMode, colorMode, toggleColorMode]);

  const currentVersion = useSelector((state) => state.currentVersion.value);
  const [showBillingModal, setShowBillingModal] = useState(false);

  let loggedIn = !!user;

  // The header is 48px tall inside a 350px panel, so a subscriber shows the
  // plan name instead of the storage charge; Billing has the full breakdown.
  const plan = user?.subscriptionTier ? getPlan(user.subscriptionTier) : null;
  const planResetAt = user?.includedUsageResetAt
    ? new Date(user.includedUsageResetAt).toLocaleDateString()
    : null;
  const planPeriodEnd = user?.subscriptionCurrentPeriodEnd
    ? new Date(user.subscriptionCurrentPeriodEnd).toLocaleDateString()
    : null;
  const planBadgeTitle = plan
    ? `${plan.name} plan — $${Number(user.includedUsage || 0).toFixed(2)} credit remaining${
        planResetAt ? ` — resets ${planResetAt}` : ""
      }${
        planPeriodEnd
          ? ` — ${user.subscriptionCancelAtPeriodEnd ? "cancels" : "renews"} ${planPeriodEnd}`
          : ""
      }`
    : null;

  return (
    <>
    <div className="TopHeader">
      <div className="TopHeader-left">
        <span className="TopHeader-brand">AnkiBrain</span>
        <span className="TopHeader-meta">v{currentVersion}{currentVersion < "1" ? " Beta" : ""}</span>
        {import.meta.env.VITE_APP_ENV === "DEV" && (
          <span className="TopHeader-meta">Dev</span>
        )}
        <span className="TopHeader-language">{language}</span>
        <button
          className="TopHeader-colorToggle"
          onClick={async (e) => {
            dispatch(setColorMode(colorMode === "dark" ? "light" : "dark"));
            e.currentTarget.blur();
            await pyEditSetting(
              "colorMode",
              colorMode === "dark" ? "light" : "dark"
            );
          }}
        >
          {colorMode === "light" ? (
            <MdDarkMode size={16} />
          ) : (
            <BsSunFill size={16} />
          )}
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
              <span className="TopHeader-userBalance">${Number(user.balance || 0).toFixed(2)}</span>
              {!user.subscriptionTier && (
                <span className="TopHeader-userStorage">S: ${Number(user.monthlyStorageCharge || 0).toFixed(2)}</span>
              )}
              {plan && (
                <span className="TopHeader-planBadge" title={planBadgeTitle}>
                  {plan.name}
                </span>
              )}
            </div>
            <button
              className="TopHeader-addBalanceBtn"
              onClick={() => setShowBillingModal(true)}
            >
              Billing
            </button>
            <div className="TopHeader-profile" id="ProfileDropdown">
              <i
                className="bi bi-person-circle"
                onClick={() => {
                  const dropdown = new Dropdown(
                    document.getElementById("ProfileDropdown")
                  );
                  dropdown.toggle();
                }}
              />
              <div className="dropdown-menu dropdown-menu-end">
                <div
                  className="dropdown-item"
                  onClick={() => {
                    const dropdown = new Dropdown(
                      document.getElementById("ProfileDropdown")
                    );
                    dropdown.toggle();
                    setShowBillingModal(true);
                  }}
                >
                  Billing
                </div>
                <div
                  className="dropdown-item"
                  onClick={async () => {
                    const dropdown = new Dropdown(
                      document.getElementById("ProfileDropdown")
                    );
                    dropdown.toggle();
                    await logout();
                  }}
                >
                  Logout
                </div>
              </div>
            </div>
          </>
        )}

        {userMode === "LOCAL" && (
          <span className="TopHeader-cost">
            ${formatSessionCost(cost.session)}
          </span>
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
    <BillingModal
      isOpen={showBillingModal}
      onClose={() => setShowBillingModal(false)}
    />
    </>
  );
}

const CLIENT_ID = "695393903745-dvnfb0guht0a1hltulv27ljh5caf2544.apps.googleusercontent.com";

const SCOPES =
  "https://www.googleapis.com/auth/calendar";

const AUTO_LOGIN_KEY =
  "wfoTrackerAutoLogin";

const ACCESS_TOKEN_KEY =
  "wfoTrackerAccessToken";

const ACCESS_TOKEN_EXPIRES_AT_KEY =
  "wfoTrackerAccessTokenExpiresAt";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let autoLoginAttempted = false;
let silentAuthInProgress = false;
let cachedSessionAttempted = false;
let sessionRestored = false;

let currentDate = new Date();

let calendarData = {};

let calendarEventIds = {};

let selectedDate = null;

let externalApiReadyAttempts = 0;

const calendarEl =
  document.getElementById("calendar");

const monthYearEl =
  document.getElementById("monthYear");

const loginStateEl =
  document.getElementById("loginState");

const loginPanelEl =
  document.getElementById("loginPanel");

const publicInfoEl =
  document.querySelector(".public-info");

const googleSignInEl =
  document.getElementById("googleSignIn");

const trackerAppEl =
  document.getElementById("trackerApp");

const logoutBtnEl =
  document.getElementById("logoutBtn");

const popupOverlayEl =
  document.getElementById("popupOverlay");

const popupDateEl =
  document.getElementById("popupDate");

const statusSelectEl =
  document.getElementById("statusSelect");

const statusOptionEls =
  document.querySelectorAll(".status-option");

const holidayNameFieldEl =
  document.getElementById("holidayNameField");

const holidayNameInputEl =
  document.getElementById("holidayNameInput");

const popupFeedbackEl =
  document.getElementById("popupFeedback");

// Save button removed - auto-save enabled
const popupCloseEl =
  document.getElementById("closePopup");

const popupCancelEl =
  document.getElementById("cancelPopup");

function waitForExternalApis() {

  externalApiReadyAttempts += 1;

  if (
    window.gapi &&
    window.google &&
    google.accounts &&
    google.accounts.oauth2
  ) {
    gapiLoaded();
    gisLoaded();
    return;
  }

  if (externalApiReadyAttempts < 80) {
    window.setTimeout(waitForExternalApis, 100);
    return;
  }

  loginStateEl.innerText =
    "Google sign-in could not load. Check your connection and refresh.";
}

async function initializeGapiClient() {

  await gapi.client.init({
    discoveryDocs: [
      "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
    ],
  });

  gapiInited = true;

  const restoredFromCache =
    await tryRestoreCachedSession();

  if (!restoredFromCache) {
    maybeAutoLogin();
  }
}

function gapiLoaded() {
  gapi.load("client", initializeGapiClient);
}

function gisLoaded() {

  tokenClient =
    google.accounts.oauth2.initTokenClient({

      client_id: CLIENT_ID,

      scope: SCOPES,

      callback: async (response) => {

        if (response.error) {

          if (silentAuthInProgress) {

            silentAuthInProgress = false;

            showLoginApp();

            return;
          }

          console.error(response);
          loginStateEl.innerText = "Login failed: " + (response.error || "Unknown error");
          showLoginApp();
          return;
        }

        silentAuthInProgress = false;

        if (response.access_token) {
          gapi.client.setToken(response);
          persistAccessToken(response);
        }

        localStorage.setItem(
          AUTO_LOGIN_KEY,
          "true"
        );

        try {
          await listCalendars();
          sessionRestored = true;
        } catch (error) {
          console.error("Failed to load calendars:", error);
          loginStateEl.innerText = "Failed to load calendars. Please try again.";
          clearPersistedAccessToken();
          showLoginApp();
        }
      },
    });

  gisInited = true;

  maybeAutoLogin();
}

window.onload = () => {

  waitForExternalApis();
};

function handleCredentialResponse() {

  if (!tokenClient) {
    loginStateEl.innerText =
      "Google sign-in is still loading. Please try again.";
    return;
  }

  silentAuthInProgress = false;
  loginStateEl.innerText = "Signing in...";

  try {
    tokenClient.requestAccessToken();
  } catch (error) {
    console.error("Sign-in error:", error);
    loginStateEl.innerText = "Sign-in failed. Please try again.";
  }
}

function maybeAutoLogin() {

  if (
    !gapiInited ||
    !gisInited ||
    autoLoginAttempted ||
    sessionRestored ||
    localStorage.getItem(AUTO_LOGIN_KEY) !== "true"
  ) {
    return;
  }

  autoLoginAttempted = true;
  silentAuthInProgress = true;

  loginStateEl.innerText =
    "Restoring your session...";

  tokenClient.requestAccessToken({
    prompt: "",
  });
}

function persistAccessToken(response) {

  if (!response.access_token) {
    return;
  }

  localStorage.setItem(
    ACCESS_TOKEN_KEY,
    response.access_token
  );

  const expiresInSeconds =
    Number(response.expires_in || 0);

  if (expiresInSeconds > 0) {

    localStorage.setItem(
      ACCESS_TOKEN_EXPIRES_AT_KEY,
      String(Date.now() + expiresInSeconds * 1000)
    );

    return;
  }

  localStorage.removeItem(
    ACCESS_TOKEN_EXPIRES_AT_KEY
  );
}

function clearPersistedAccessToken() {

  localStorage.removeItem(
    ACCESS_TOKEN_KEY
  );

  localStorage.removeItem(
    ACCESS_TOKEN_EXPIRES_AT_KEY
  );
}

function getPersistedAccessToken() {

  const accessToken =
    localStorage.getItem(ACCESS_TOKEN_KEY);

  if (!accessToken) {
    return null;
  }

  const expiresAt =
    Number(
      localStorage.getItem(
        ACCESS_TOKEN_EXPIRES_AT_KEY
      ) || "0"
    );

  if (expiresAt > 0 && Date.now() >= expiresAt - 60 * 1000) {
    clearPersistedAccessToken();
    return null;
  }

  return accessToken;
}

async function tryRestoreCachedSession() {

  if (
    !gapiInited ||
    cachedSessionAttempted ||
    sessionRestored ||
    localStorage.getItem(AUTO_LOGIN_KEY) !== "true"
  ) {
    return false;
  }

  cachedSessionAttempted = true;

  const accessToken =
    getPersistedAccessToken();

  if (!accessToken) {
    return false;
  }

  loginStateEl.innerText =
    "Restoring your session...";

  gapi.client.setToken({
    access_token: accessToken,
  });

  try {
    await listCalendars();
    sessionRestored = true;
    return true;
  } catch (error) {
    console.error(
      "Cached session restore failed:",
      error
    );

    clearPersistedAccessToken();
    showLoginApp();
    return false;
  }
}

function getDateString(date) {

  const yyyy =
    date.getFullYear();

  const mm =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const dd =
    String(date.getDate())
      .padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function getLocalDateFromString(dateString) {

  const [year, month, day] =
    dateString.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDaysToDateString(dateString, days) {

  const date =
    getLocalDateFromString(dateString);

  date.setDate(date.getDate() + days);

  return getDateString(date);
}

function getDisplayDate(dateString) {

  return getLocalDateFromString(dateString)
    .toLocaleDateString("default", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
}

function isCompactCalendarLayout() {

  return window.matchMedia("(max-width: 480px)").matches;
}

function getCalendarStatusLabel(displayStatus, eventStatus) {

  const compactLayout =
    isCompactCalendarLayout();

  if (displayStatus === "WFH") {
    return compactLayout ? "WFH" : "Home";
  }

  if (displayStatus === "WFO") {
    return compactLayout ? "WFO" : "Office";
  }

  if (displayStatus === "WORKCATION") {
    return compactLayout ? "WC" : "Workcation";
  }

  if (displayStatus === "HOLIDAY") {

    const holidayName =
      getHolidayName(eventStatus);

    if (!holidayName) {
      return compactLayout ? "H" : "Holiday";
    }

    return compactLayout ? "H" : holidayName;
  }

  if (displayStatus === "LEAVE_1") {
    return compactLayout ? "L" : "Leave";
  }

  return "";
}

function getCalendarStatusAriaLabel(displayStatus, eventStatus) {

  if (displayStatus === "WFH") {
    return "Home";
  }

  if (displayStatus === "WFO") {
    return "Office";
  }

  if (displayStatus === "WORKCATION") {
    return "Workcation";
  }

  if (displayStatus === "HOLIDAY") {

    const holidayName =
      getHolidayName(eventStatus);

    return holidayName || "Holiday";
  }

  if (displayStatus === "LEAVE_1") {
    return "Leave";
  }

  return "";
}

function getStatusType(status) {

  if (!status) return "";

  if (status.startsWith("HOLIDAY")) {
    return "HOLIDAY";
  }

  return status;
}

function getHolidayName(status) {

  if (!status || !status.startsWith("HOLIDAY:")) {
    return "";
  }

  return status.slice("HOLIDAY:".length).trim();
}

function getStatusClass(statusType) {

  return statusType
    .replace(/\./g, "_")
    .replace(/-/g, "_");
}

function getHolidaySummary() {

  const holidayName =
    holidayNameInputEl.value.trim();

  if (!holidayName) return "HOLIDAY";

  return `HOLIDAY: ${holidayName}`;
}

function setPopupStatus(value) {

  const statusType =
    getStatusType(value);

  statusSelectEl.value =
    statusType;

  holidayNameFieldEl.classList.toggle(
    "hidden",
    statusType !== "HOLIDAY"
  );

  statusOptionEls.forEach((optionEl) => {

    const isSelected =
      optionEl.dataset.status === statusType;

    optionEl.classList.toggle(
      "selected",
      isSelected
    );

    optionEl.setAttribute(
      "aria-pressed",
      String(isSelected)
    );
  });
}

function closePopup() {

  popupOverlayEl.classList.add("hidden");
  selectedDate = null;
  popupFeedbackEl.innerText = "";
  holidayNameInputEl.value = "";
  holidayNameFieldEl.classList.add("hidden");
}

function showTrackerApp() {

  loginPanelEl.classList.add("hidden");
  trackerAppEl.classList.remove("hidden");

  if (publicInfoEl) {
    publicInfoEl.classList.add("hidden");
  }
}

function showLoginApp() {

  trackerAppEl.classList.add("hidden");
  loginPanelEl.classList.remove("hidden");

  if (publicInfoEl) {
    publicInfoEl.classList.remove("hidden");
  }

  loginStateEl.innerText =
    "Sign in to load your private WFO calendar and projection.";
}

function isWeekendDateString(dateString) {

  const date =
    getLocalDateFromString(dateString);

  const weekday =
    date.getDay();

  return weekday === 0 || weekday === 6;
}

function logout() {

  const token =
    gapi.client.getToken();

  if (token) {

    google.accounts.oauth2.revoke(
      token.access_token
    );

    gapi.client.setToken("");
  }

  localStorage.removeItem("trackerCalendarId");
  localStorage.removeItem(AUTO_LOGIN_KEY);
  clearPersistedAccessToken();
  calendarData = {};
  calendarEventIds = {};
  autoLoginAttempted = false;
  silentAuthInProgress = false;
  cachedSessionAttempted = false;
  sessionRestored = false;

  showLoginApp();
}

async function listCalendars() {

  const response =
    await gapi.client.calendar.calendarList.list();

  const calendars =
    response.result.items;

  let trackerCalendar =
    calendars.find(
      (cal) => cal.summary === "WFO Tracker"
    );

  if (!trackerCalendar) {

    const createResponse =
      await gapi.client.calendar.calendars.insert({

        summary: "WFO Tracker",
      });

    trackerCalendar =
      createResponse.result;
  }

  localStorage.setItem(
    "trackerCalendarId",
    trackerCalendar.id
  );

  await loadCalendarEvents();

  showTrackerApp();

  renderCalendar();
  calculateStats();
}

async function loadCalendarEvents() {

  const calendarId =
    localStorage.getItem("trackerCalendarId");

  if (!calendarId) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const start =
    new Date(year, month, 1).toISOString();

  const end =
    new Date(year, month + 1, 0, 23, 59, 59)
      .toISOString();

  const response =
    await gapi.client.calendar.events.list({

      calendarId,

      timeMin: start,

      timeMax: end,

      singleEvents: true,

      orderBy: "startTime",
    });

  calendarData = {};
  calendarEventIds = {};

  response.result.items.forEach((event) => {

    const date =
      event.start.date;

    if (!date) return;

    calendarData[date] =
      event.summary;

    calendarEventIds[date] =
      event.id;
  });

  renderCalendar();
  calculateStats();
}

function renderCalendar() {

  calendarEl.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  monthYearEl.innerText =
    currentDate.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

  const firstDay =
    new Date(year, month, 1).getDay();

  const totalDays =
    new Date(year, month + 1, 0).getDate();

  const adjustedFirstDay =
    (firstDay + 6) % 7;

  const dayNames =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  dayNames.forEach((day) => {

    const dayNameEl =
      document.createElement("div");

    dayNameEl.classList.add("day-name");

    dayNameEl.innerText = day;

    calendarEl.appendChild(dayNameEl);
  });

  for (let i = 0; i < adjustedFirstDay; i++) {

    const empty =
      document.createElement("div");

    calendarEl.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {

    const dayEl =
      document.createElement("div");

    dayEl.classList.add("day");

    const thisDate =
      new Date(year, month, day);

    const dateString =
      getDateString(thisDate);

    const dateNumber =
      document.createElement("div");

    dateNumber.classList.add("date-number");

    dateNumber.innerText = day;

    dayEl.appendChild(dateNumber);

    const today = new Date();

    if (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    ) {
      dayEl.classList.add("today");
    }

    const weekday =
      thisDate.getDay();

    if (weekday === 0 || weekday === 6) {
      dayEl.classList.add("weekend");
    }

    const eventStatus =
      calendarData[dateString];

    const displayStatus =
      getStatusType(eventStatus) ||
      (
        weekday !== 0 &&
        weekday !== 6
          ? "WFH"
          : ""
      );

    if (displayStatus) {

      const safeClass =
        getStatusClass(displayStatus);

      dayEl.classList.add(safeClass);

      const label =
        document.createElement("div");

      label.classList.add("status-label");

      label.setAttribute(
        "aria-label",
        getCalendarStatusAriaLabel(displayStatus, eventStatus)
      );

      if (displayStatus === "WFH") {
        label.innerText =
          getCalendarStatusLabel(displayStatus, eventStatus);
      }

      else if (displayStatus === "WFO") {
        label.innerText =
          getCalendarStatusLabel(displayStatus, eventStatus);
      }

      else if (displayStatus === "WORKCATION") {
        label.innerText =
          getCalendarStatusLabel(displayStatus, eventStatus);
      }

      else if (displayStatus === "HOLIDAY") {
        label.innerText =
          getCalendarStatusLabel(displayStatus, eventStatus);
      }

      else if (displayStatus === "LEAVE_1") {
        label.innerText =
          getCalendarStatusLabel(displayStatus, eventStatus);
      }

      else if (displayStatus === "LEAVE_0.5_WFO") {

        label.classList.add("split-status");

        label.innerHTML = `
          <div class="split-label-top">
            Leave
          </div>

          <div class="split-label-bottom">
            Office
          </div>
        `;
      }

      else if (displayStatus === "LEAVE_0.5_WFH") {

        label.classList.add("split-status");

        label.innerHTML = `
          <div class="split-label-top">
            Leave
          </div>

          <div class="split-label-bottom">
            Home
          </div>
        `;
      }

      dayEl.appendChild(label);
    }

    if (weekday !== 0 && weekday !== 6) {
      dayEl.onclick = () =>
        openPopup(dateString);
    }

    calendarEl.appendChild(dayEl);
  }
}

function calculateStats() {

  const year =
    currentDate.getFullYear();

  const month =
    currentDate.getMonth();

  const totalDays =
    new Date(year, month + 1, 0)
      .getDate();

  let workingDays = 0;
  let wfoDays = 0;
  let leaveDaysTaken = 0;
  let workcationDays = 0;

  for (let day = 1; day <= totalDays; day++) {

    const thisDate =
      new Date(year, month, day);

    const weekday =
      thisDate.getDay();

    if (weekday === 0 || weekday === 6) {
      continue;
    }

    const dateString =
      getDateString(thisDate);

    const status =
      getStatusType(calendarData[dateString]);

    if (status === "HOLIDAY") {
      continue;
    }

    if (status === "WORKCATION") {
      workcationDays += 1;
      continue;
    }

    if (status === "LEAVE_1") {
      leaveDaysTaken += 1;
      continue;
    }

    if (status === "LEAVE_0.5_WFO") {

      workingDays += 0.5;
      wfoDays += 1;
      leaveDaysTaken += 0.5;

      continue;
    }

    if (status === "LEAVE_0.5_WFH") {

      workingDays += 0.5;
      leaveDaysTaken += 0.5;

      continue;
    }

    workingDays += 1;

    if (status === "WFO") {
      wfoDays += 1;
    }
  }

  let percentage = 0;

  if (workingDays > 0) {

    percentage =
      (
        (wfoDays / workingDays) * 100
      ).toFixed(1);
  }

  const requiredWfo =
    Math.ceil(workingDays * 0.6);

  const remainingNeeded =
    Math.max(requiredWfo - wfoDays, 0);

  const targetPercentage = 60;

  const progressPercent =
    Math.min(Number(percentage), 100);

  const targetMet =
    Number(percentage) >= targetPercentage;

  let leaveDaysNeeded = 0;

  if (!targetMet && wfoDays > 0) {

    leaveDaysNeeded =
      Math.ceil(
        (workingDays - (wfoDays / 0.6)) * 2
      ) / 2;

    leaveDaysNeeded =
      Math.max(leaveDaysNeeded, 0);
  }

  const projectionMessage =
    targetMet
      ? "You are on track for the 60% office target."
      : wfoDays === 0
        ? `Go Office ${remainingNeeded} more day${
            remainingNeeded === 1 ? "" : "s"
          } to start moving toward 60%.`
        : `Go Office ${remainingNeeded} more day${
            remainingNeeded === 1 ? "" : "s"
          }, or reduce working days by ${leaveDaysNeeded} leave day${
            leaveDaysNeeded === 1 ? "" : "s"
          }.`;

  const leaveText =
    targetMet
      ? "Not needed"
      : wfoDays === 0
        ? "Office first"
        : `${leaveDaysNeeded}`;

  document.getElementById("wfoPercent")
    .innerText = `${percentage}%`;

  document.getElementById("projectionStatus")
    .innerText =
      targetMet ? "On track" : "Needs attention";

  document.getElementById("projectionMessage")
    .innerText = projectionMessage;

  const progressFillEl =
    document.getElementById("progressFill");

  progressFillEl.style.width =
    `${progressPercent}%`;

  progressFillEl.classList.toggle(
    "on-track",
    targetMet
  );

  progressFillEl.classList.toggle(
    "behind",
    !targetMet
  );

  document.getElementById("statsText")
    .innerHTML = `

      <div class="stat-tile">
        <span>Total working days</span>
        <b>${workingDays}</b>
      </div>

      <div class="stat-tile">
        <span>Office days</span>
        <b>${wfoDays}</b>
      </div>

      <div class="stat-tile">
        <span>Leaves taken</span>
        <b>${leaveDaysTaken}</b>
      </div>

      <div class="stat-tile">
        <span>Workcation days</span>
        <b>${workcationDays}</b>
      </div>

      <div class="stat-tile">
        <span>Office days needed</span>
        <b>${remainingNeeded}</b>
      </div>

      <div class="stat-tile">
        <span>Leave days for 60%</span>
        <b>${leaveText}</b>
      </div>
    `;
}

function openPopup(dateString) {

  if (isWeekendDateString(dateString)) {
    return;
  }

  selectedDate = dateString;

  popupDateEl.innerText =
    getDisplayDate(dateString);

  popupFeedbackEl.innerText = "";
  holidayNameInputEl.value =
    getHolidayName(calendarData[dateString]);

  setPopupStatus(
    calendarData[dateString] || ""
  );

  popupOverlayEl.classList.remove("hidden");
}

statusOptionEls.forEach((optionEl) => {

  optionEl.onclick = async () => {
    setPopupStatus(optionEl.dataset.status);
    await saveEventForSelectedDate();
  };
});

popupCloseEl.onclick =
  closePopup;

popupCancelEl.onclick =
  closePopup;

logoutBtnEl.onclick =
  logout;

popupOverlayEl.onclick = (event) => {

  if (event.target === popupOverlayEl) {
    closePopup();
  }
};

document.onkeydown = (event) => {

  if (
    event.key === "Escape" &&
    !popupOverlayEl.classList.contains("hidden")
  ) {
    closePopup();
  }
};

async function saveEventForSelectedDate() {

  if (selectedDate && isWeekendDateString(selectedDate)) {
    popupFeedbackEl.innerText =
      "Weekend entries are read-only.";
    return;
  }

  const value = statusSelectEl.value;

  const summary =
    value === "HOLIDAY"
      ? getHolidaySummary()
      : value;

  const calendarId =
    localStorage.getItem("trackerCalendarId");

  if (!calendarId) {
    popupFeedbackEl.innerText =
      "Sign in with Google before saving.";
    return;
  }

  if (!selectedDate) return;

  popupFeedbackEl.innerText = "Saving...";

  try {

    const existingEventId =
      calendarEventIds[selectedDate];

    if (existingEventId) {

      await gapi.client.calendar.events.delete({

        calendarId,

        eventId: existingEventId,
      });
    }

    if (summary !== "") {

      await gapi.client.calendar.events.insert({

        calendarId,

        resource: {

          summary,

          start: {
            date: selectedDate,
          },

          end: {
            date: addDaysToDateString(selectedDate, 1),
          },
        },
      });
    }

    popupFeedbackEl.innerText = "Saved!";
    setTimeout(() => {
      closePopup();
    }, 300);

    await loadCalendarEvents();
  }

  catch (error) {

    console.error(error);

    popupFeedbackEl.innerText =
      "Could not save. Please try again.";
  }
}

// Auto-save enabled - Save button removed
// Old onclick handler no longer needed

document
  .getElementById("prevMonth")
  .onclick = async () => {

    currentDate.setMonth(
      currentDate.getMonth() - 1
    );

    await loadCalendarEvents();
  };

document
  .getElementById("nextMonth")
  .onclick = async () => {

    currentDate.setMonth(
      currentDate.getMonth() + 1
    );

    await loadCalendarEvents();
  };

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.warn("Service Worker registration failed:", error);
  });
}

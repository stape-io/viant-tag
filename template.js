const BigQuery = require('BigQuery');
const generateRandom = require('generateRandom');
const getAllEventData = require('getAllEventData');
const getContainerVersion = require('getContainerVersion');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Math = require('Math');
const Object = require('Object');
const Promise = require('Promise');
const sendHttpRequest = require('sendHttpRequest');
const sha256Sync = require('sha256Sync');
const templateDataStorage = require('templateDataStorage');
const toBase64 = require('toBase64');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();
const useOptimisticScenario = isUIFieldTrue(data.useOptimisticScenario);

if (!isConsentGivenOrNotRequired(data, eventData)) {
  return data.gtmOnSuccess();
}

const url = getUrl(eventData);
if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const mappedData = mapEvent(data, eventData);

sendRequest(data, mappedData);

if (useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function addServerEventData(data, event) {
  if (isUIFieldTrue(data.autoMapServerEventDataParameters)) {
    event.salesData.conversionTimestamp = convertTimestampToISO(getTimestampMillis());
  }

  if (data.serverEventDataList) {
    data.serverEventDataList.forEach((d) => {
      if (d.name === 'conversionTimestamp' && makeString(d.value).match('^[0-9]+$') !== null) {
        event.salesData[d.name] = convertTimestampToISO(makeInteger(d.value));
        return;
      }
      event.salesData[d.name] = d.value;
    });
  }

  return event;
}

function getEmailAddressesFromEventData(eventData) {
  const eventDataUserData = eventData.user_data || {};

  const email =
    eventDataUserData.email ||
    eventDataUserData.email_address ||
    eventDataUserData.sha256_email ||
    eventDataUserData.sha256_email_address;

  const emailType = getType(email);

  if (emailType === 'string') return [email];
  else if (emailType === 'array') return email.length > 0 ? email : [];
  else if (emailType === 'object') {
    const emailsFromObject = Object.values(email);
    if (emailsFromObject.length) return emailsFromObject;
  }

  return [];
}

function getPhoneNumbersFromEventData(eventData) {
  const eventDataUserData = eventData.user_data || {};

  const phone =
    eventDataUserData.phone ||
    eventDataUserData.phone_number ||
    eventDataUserData.sha256_phone_number;

  const phoneType = getType(phone);

  if (phoneType === 'string' || phoneType === 'number') return [phone];
  else if (phoneType === 'array') return phone.length > 0 ? phone : [];
  else if (phoneType === 'object') {
    const phonesFromObject = Object.values(phone);
    if (phonesFromObject.length) return phonesFromObject;
  }

  return [];
}

function addUserIdentifiers(data, eventData, event) {
  const itemizeUserIdentifier = (input) => {
    const type = getType(input);
    if (type === 'array') return input.filter((e) => e);
    if (type === 'string' || type === 'number') return [input];
    return [];
  };

  const userIdentifiersListsByType = {
    email_sha256: [],
    phonenumber_sha256: [],
    ip: [],
    mobile_id: []
  };

  if (isUIFieldTrue(data.autoMapUserIdentifiersParameters)) {
    const emailAddresses = getEmailAddressesFromEventData(eventData);
    if (emailAddresses.length) {
      userIdentifiersListsByType.email_sha256 = emailAddresses;
      userIdentifiersListsByType.email_sha256.autoMapped = true;
    }

    const phoneNumbers = getPhoneNumbersFromEventData(eventData);
    if (phoneNumbers.length) {
      userIdentifiersListsByType.phonenumber_sha256 = phoneNumbers;
      userIdentifiersListsByType.phonenumber_sha256.autoMapped = true;
    }

    if (eventData.ip_override) {
      userIdentifiersListsByType.ip.push(eventData.ip_override);
      userIdentifiersListsByType.ip.autoMapped = true;
    }

    let mobileDeviceId = eventData['x-ga-resettable_device_id'];
    const platform = eventData['x-ga-platform'];
    if (platform === 'ios' && mobileDeviceId === '00000000-0000-0000-0000-000000000000') {
      mobileDeviceId === eventData['x-ga-vendor_device_id'];
    }
    if (mobileDeviceId) {
      userIdentifiersListsByType.mobile_id.push(mobileDeviceId);
      userIdentifiersListsByType.mobile_id.autoMapped = true;
    }
  }

  if (data.userIdentifiersParametersList) {
    data.userIdentifiersParametersList.forEach((d) => {
      userIdentifiersListsByType[d.name] = userIdentifiersListsByType[d.name] || [];

      if (
        userIdentifiersListsByType[d.name].autoMapped &&
        !userIdentifiersListsByType[d.name].overridenByUI
      ) {
        userIdentifiersListsByType[d.name] = [];
        userIdentifiersListsByType[d.name].overridenByUI = true;
      }

      if (!d.value) return;

      const itemizedUserIdentifier = itemizeUserIdentifier(d.value);

      if (getType(itemizedUserIdentifier) === 'array' && itemizedUserIdentifier.length) {
        itemizedUserIdentifier.forEach((item) => {
          userIdentifiersListsByType[d.name].push(item);
        });
      }
    });
  }

  const userIdentifiers = [];
  Object.keys(userIdentifiersListsByType).forEach((type) => {
    const userIdentifiersListByType = userIdentifiersListsByType[type];
    if (getType(userIdentifiersListByType) === 'array') {
      userIdentifiersListByType.forEach((userIdentifier) => {
        userIdentifiers.push({ type: type, value: userIdentifier });
      });
    }
  });

  event.salesData.identifiers = userIdentifiers;

  return event;
}

function getEventId(eventData) {
  return (
    eventData.transaction_id ||
    eventData.eventId ||
    eventData.event_id ||
    eventData.unique_event_id ||
    getTimestampMillis() + '_' + generateRandom(100000000, 999999999)
  );
}

function addEventData(data, eventData, event) {
  if (isUIFieldTrue(data.autoMapServerEventDataParameters)) {
    let currencyFromItems;
    let valueFromItems;
    if (getType(eventData.items) === 'array' && eventData.items.length) {
      event.salesData.purchasedItems = [];
      valueFromItems = 0;
      currencyFromItems = eventData.items[0].currency;
      const itemIdKey = data.itemIdKey ? data.itemIdKey : 'item_id';
      eventData.items.forEach((i) => {
        const item = {};
        if (i[itemIdKey]) item.itemId = makeString(i[itemIdKey]);
        if (i.item_name) item.productName = makeString(i.item_name);
        if (i.quantity) item.quantity = makeInteger(i.quantity);
        if (i.item_category) item.productCategory = makeString(i.item_category);
        if (isValidValue(i.price)) {
          item.price = makeNumber(i.price);
          valueFromItems += item.quantity ? item.quantity * item.price : item.price;
        }
        event.salesData.purchasedItems.push(item);
      });
    }

    if (isValidValue(eventData.value)) {
      const value = makeNumber(eventData.value);
      event.salesData.amount = value;
    } else if (isValidValue(valueFromItems)) {
      event.salesData.amount = valueFromItems;
    }

    const currency = eventData.currency || currencyFromItems;
    if (currency) event.salesData.currency = makeString(currency);

    const eventId = data.transactionId || getEventId(eventData);
    if (eventId) {
      event.salesData.transactionId = makeString(eventId);
    }
  }

  if (getType(data.eventParametersObject) === 'object') {
    mergeObj(event.salesData, data.eventParametersObject);
  }
  if (data.eventParametersList) {
    data.eventParametersList.forEach((d) => {
      const names = d.name.split('.');
      names.reduce((acc, name, index) => {
        const isLastKey = index === names.length - 1;
        if (isLastKey) acc[name] = d.value;
        else acc[name] = acc[name] || {};
        return acc[name];
      }, event.salesData);
    });
  }

  return event;
}

function addEventCustomData(data, event) {
  const customParameters = {};

  if (getType(data.eventCustomParametersObject) === 'object') {
    mergeObj(customParameters, data.eventCustomParametersObject);
  }

  if (data.eventCustomParametersList) {
    data.eventCustomParametersList.forEach((d) => {
      customParameters[d.name] = d.value;
    });
  }

  event.salesData.custom = customParameters;

  return event;
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;

  phoneNumber = phoneNumber
    .split(' ')
    .join('')
    .split('-')
    .join('')
    .split('(')
    .join('')
    .split(')')
    .join('');
  if (phoneNumber[0] !== '+') phoneNumber = '+' + phoneNumber; // TO DO - Check if the + will be used or not
  return phoneNumber;
}

function hashDataIfNeeded(event) {
  const userIdentifiers = event.salesData.identifiers;
  const hasUserIdentifiers = getType(userIdentifiers) === 'array' && userIdentifiers.length;

  if (hasUserIdentifiers) {
    const userIdentifiersKeysToHash = {
      email_sha256: true,
      phonenumber_sha256: true,
      address_sha256: true
    };
    const userIdentifiersKeysToNormalize = {
      phonenumber_sha256: normalizePhoneNumber
    };
    userIdentifiers.forEach((userIdentifier) => {
      const type = userIdentifier.type;
      let value = userIdentifier.value;
      if (!userIdentifiersKeysToHash[type]) return;
      if (userIdentifiersKeysToNormalize[type]) value = userIdentifiersKeysToNormalize[type](value);
      userIdentifier.value = hashData(value);
    });
  }

  return event;
}

function mapEventName(data, eventData) {
  if (data.eventTypeSetupMethod === 'inherit') {
    const eventName = eventData.event_name;

    const gaToEventName = {
      page_view: 'PageView',
      view_item: 'ItemView',
      add_to_cart: 'AddToCart',
      begin_checkout: 'InitiateCheckout',
      add_payment_info: 'AddPaymentInfo',
      generate_lead: 'Lead',
      purchase: 'Purchase'
    };

    return gaToEventName[eventName] || eventName;
  }

  return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEvent(data, eventData) {
  const event = {
    accountId: makeInteger(data.accountId),
    advertisers: data.advertiserIds.filter((obj) => !!obj).map((obj) => makeInteger(obj.id)),
    salesData: {
      conversionEventType: mapEventName(data, eventData)
    }
  };
  const mappedData = [event];

  addServerEventData(data, event);
  addUserIdentifiers(data, eventData, event);
  addEventData(data, eventData, event);
  addEventCustomData(data, event);
  hashDataIfNeeded(event);

  return mappedData;
}

function generateRequestBaseUrlByRequestType(requestType) {
  const version = '1';
  const requestPathByRequestType = {
    accessToken: '/oauth2/authenticate',
    conversion: '/conversions'
  };
  return 'https://vdp-connect-api.viantinc.com/v' + version + requestPathByRequestType[requestType];
}

function generateRequestOptionsByRequestType(data, requestType, accessToken) {
  const requestOptionsByRequestType = {
    accessToken: {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + toBase64(data.authUsername + ':' + data.authPassword),
        'Content-Type': 'application/json'
      }
    },
    conversion: {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }
    }
  };

  return requestOptionsByRequestType[requestType];
}

function getAccessToken(data, byPassTokenCacheCheck) {
  const cacheKey = sha256Sync('viantcapi' + data.authUsername + data.authPassword);
  const auth = templateDataStorage.getItemCopy(cacheKey);

  if (!byPassTokenCacheCheck && getType(auth) === 'object') {
    const accessToken = auth.accessToken;
    const expiresAt = auth.expiresAt; // TTL in milliseconds.
    const isAccessTokenValid = getTimestampMillis() < expiresAt;
    if (accessToken && isAccessTokenValid) {
      return Promise.create((resolve) => resolve(accessToken));
    }
  }

  const requestUrl = generateRequestBaseUrlByRequestType('accessToken');
  const requestOptions = generateRequestOptionsByRequestType(data, 'accessToken');

  log({
    Name: 'ViantCAPI',
    Type: 'Request',
    EventName: 'AccessToken',
    RequestMethod: requestOptions.method,
    RequestUrl: requestUrl
  });

  return sendHttpRequest(requestUrl, requestOptions)
    .then((result) => {
      log({
        Name: 'ViantCAPI',
        Type: 'Response',
        EventName: 'AccessToken',
        ResponseStatusCode: result.statusCode,
        ResponseHeaders: result.headers
      });

      if (result.statusCode === 200) {
        const parsedBody = JSON.parse(result.body || '{}');
        if (!parsedBody.access_token || !parsedBody.expires_in) {
          return !useOptimisticScenario ? data.gtmOnFailure() : undefined;
        }

        const auth = {
          accessToken: parsedBody.access_token,
          // 90% of the real expiration time.
          expiresAt: getTimestampMillis() + parsedBody.expires_in * 1000 * 0.9
        };
        templateDataStorage.setItemCopy(cacheKey, auth);
        return auth.accessToken;
      } else {
        return !useOptimisticScenario ? data.gtmOnFailure() : undefined;
      }
    })
    .catch((result) => {
      log({
        Name: 'ViantCAPI',
        Type: 'Message',
        EventName: 'AccessToken',
        Message: 'Request failed or timed out.',
        Reason: JSON.stringify(result)
      });

      return !useOptimisticScenario ? data.gtmOnFailure() : undefined;
    });
}

function sendConversion(data, mappedData, accessToken) {
  const requestUrl = generateRequestBaseUrlByRequestType('conversion');
  const requestOptions = generateRequestOptionsByRequestType(data, 'conversion', accessToken);

  const eventName = mappedData[0].salesData.conversionEventType;
  log({
    Name: 'ViantCAPI',
    Type: 'Request',
    EventName: eventName,
    RequestMethod: requestOptions.method,
    RequestUrl: requestUrl,
    RequestBody: mappedData
  });

  return sendHttpRequest(requestUrl, requestOptions, JSON.stringify(mappedData))
    .then((result) => {
      log({
        Name: 'ViantCAPI',
        Type: 'Response',
        EventName: eventName,
        ResponseStatusCode: result.statusCode,
        ResponseHeaders: result.headers,
        ResponseBody: result.body
      });

      const parsedBody = JSON.parse(result.body || '{}');

      if (result.statusCode >= 200 && result.statusCode < 400) {
        return !useOptimisticScenario ? data.gtmOnSuccess() : undefined;
      } else if (result.statusCode === 401 && parsedBody.message === 'Jwt is expired') {
        return sendRequest(data, mappedData, true);
      } else {
        return !useOptimisticScenario ? data.gtmOnFailure() : undefined;
      }
    })
    .catch((result) => {
      log({
        Name: 'ViantCAPI',
        Type: 'Message',
        EventName: eventName,
        Message: 'Request failed or timed out.',
        Reason: JSON.stringify(result)
      });

      return !useOptimisticScenario ? data.gtmOnFailure() : undefined;
    });
}

function sendRequest(data, mappedData, byPassTokenCacheCheck) {
  getAccessToken(data, byPassTokenCacheCheck).then((accessToken) => {
    if (!accessToken) return;
    sendConversion(data, mappedData, accessToken);
  });
}

/*==============================================================================
  Helpers
==============================================================================*/

function getUrl(eventData) {
  return eventData.page_location || eventData.page_referrer || getRequestHeader('referer');
}

function mergeObj(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) target[key] = source[key];
  }
  return target;
}

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(value) {
  if (!value) return value;

  const type = getType(value);

  if (value === 'undefined' || value === 'null') return undefined;

  if (type === 'array') {
    return value.map((val) => hashData(val));
  }

  if (type === 'object') {
    return Object.keys(value).reduce((acc, val) => {
      acc[val] = hashData(value[val]);
      return acc;
    }, {});
  }

  if (isHashed(value)) return value;

  return sha256Sync(makeString(value).trim().toLowerCase(), {
    outputEncoding: 'hex'
  });
}

function convertTimestampToISO(timestamp) {
  const leapYear = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const nonLeapYear = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const secToMs = (s) => s * 1000;
  const minToMs = (m) => m * secToMs(60);
  const hoursToMs = (h) => h * minToMs(60);
  const daysToMs = (d) => d * hoursToMs(24);
  const padStart = (value, length) => {
    let result = makeString(value);
    while (result.length < length) {
      result = '0' + result;
    }
    return result;
  };

  const fourYearsInMs = daysToMs(365 * 4 + 1);
  let year = 1970 + Math.floor(timestamp / fourYearsInMs) * 4;
  timestamp = timestamp % fourYearsInMs;

  while (true) {
    let isLeapYear = year % 4 === 0;
    let nextTimestamp = timestamp - daysToMs(isLeapYear ? 366 : 365);
    if (nextTimestamp < 0) {
      break;
    }
    timestamp = nextTimestamp;
    year = year + 1;
  }

  const daysByMonth = year % 4 === 0 ? leapYear : nonLeapYear;

  let month = 0;
  for (let i = 0; i < daysByMonth.length; i++) {
    const msInThisMonth = daysToMs(daysByMonth[i]);
    if (timestamp > msInThisMonth) {
      timestamp = timestamp - msInThisMonth;
    } else {
      month = i + 1;
      break;
    }
  }

  const date = Math.ceil(timestamp / daysToMs(1));
  timestamp = timestamp - daysToMs(date - 1);
  const hours = Math.floor(timestamp / hoursToMs(1));
  timestamp = timestamp - hoursToMs(hours);
  const minutes = Math.floor(timestamp / minToMs(1));
  timestamp = timestamp - minToMs(minutes);
  const sec = Math.floor(timestamp / secToMs(1));
  timestamp = timestamp - secToMs(sec);
  const milliSeconds = timestamp;

  return (
    year +
    '-' +
    padStart(month, 2) +
    '-' +
    padStart(date, 2) +
    'T' +
    padStart(hours, 2) +
    ':' +
    padStart(minutes, 2) +
    ':' +
    padStart(sec, 2) +
    '.' +
    padStart(milliSeconds, 3) +
    'Z'
  );
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  rawDataToLog.TraceId = getRequestHeader('trace-id');

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  BigQuery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}

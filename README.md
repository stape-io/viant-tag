# Viant Conversion API Tag for Google Tag Manager Server-Side

The **Viant Conversion API Tag** for Google Tag Manager Server-Side allows you to send conversion events from your server container directly to the [Viant Data Platform (VDP) Connect API](https://docs.api.viantinc.com/reference/onboard-onlineoffline-conversion-data). This server-to-server integration offers a more robust and secure way to track conversions and user data.

## Features

- **Server-to-Server Events**: Sends conversion data directly from the GTM Server Container to Viant's Conversion API.
- **Automatic Authentication**: Handles OAuth 2.0 authentication and automatically caches the access token to optimize requests.
- **Flexible Event Mapping**: Supports standard Viant events, inheriting from GA4 event names, or custom event names.
- **Automatic Data Mapping**: Intelligently maps parameters from the incoming GTM event data (e.g., GA4 schema) for event details, user identifiers, and purchased items.
- **PII Hashing**: Automatically hashes user data like email and phone numbers using SHA-256 to meet privacy requirements.
- **Consent Mode Support**: Integrates with Google Consent Mode, checking for `ad_storage` consent before sending data.
- **Advanced Logging**: Provides options for logging to the GTM console for debugging and persistent logging to BigQuery for monitoring.

## Installation

1.  **Download the Template**:
    - Download the `template.tpl` file from this repository.
2.  **Import to GTM Server Container**:
    - In your GTM Server Container, navigate to the **Templates** section.
    - Click **New** under the **Tag Templates** section.
    - Click the **three-dot menu** in the top right and select **Import**.
    - Select the downloaded `template.tpl` file and click **Save**.
3.  **Create a New Tag**:
    - Go to **Tags** and click **New**.
    - Select the newly imported **"Viant Conversion API"** tag.

## Tag Configuration

### Base Configuration

| Parameter | Description |
| :--- | :--- |
| **Event Name Setup Method** | Choose how the event name is determined: `Standard` (from a dropdown), `Inherit from client` (maps GA4 event names), or `Custom`. |
| **Viant Account ID** | Your unique Viant Account ID. |
| **Viant Advertiser IDs** | A list of Viant Advertiser IDs associated with your account. |
| **Conversion API Username** | The username for the Viant Conversion API. |
| **Conversion API Password** | The password for the Viant Conversion API. |
| **Use Optimistic Scenario** | If `true`, the tag will fire `gtmOnSuccess()` immediately without waiting for the API response. This speeds up server response time but may report success even if the API call fails. |

### Server Event Data Parameters

| Parameter | Description |
| :--- | :--- |
| **Auto-map Server Event Data Parameters** | If `true`, the tag automatically sets the `conversionTimestamp` to the time the server tag fired. |
| **Server Event Data Parameters** | Manually override or add server event data parameters. `conversionTimestamp` can be provided as an ISO 8601 string or a UNIX timestamp in milliseconds. |

### User Identifiers Parameters

| Parameter | Description |
| :--- | :--- |
| **Automap User Identifiers Parameters** | If `true`, the tag automatically maps user identifiers from the event data, including email, IP address, and mobile device IDs. |
| **User Identifiers Parameters** | Manually provide user identifiers. Supported types include `Email Address`, `Phone Number`, `IP Address`, `Mobile ID`, and `User Physical Address`. Email, phone, and address will be automatically SHA-256 hashed if not already. |

### Event Parameters

| Parameter | Description |
| :--- | :--- |
| **Automap Event Parameters** | If `true`, the tag automatically maps `transaction_id`, `value`, `currency`, and `items` from the GA4 event data schema. |
| **Custom Item ID Key** | (Only if auto-mapping is enabled) Specify a custom key for the item ID within the `items` array (defaults to `item_id`). |
| **Event Parameters Object** | Provide a GTM variable that returns an object of event parameters to be merged. |
| **Event Parameters** | Manually specify event parameters like `Transaction ID`, `Amount`, `Currency`, `Purchased Items`, and `Conversion Location`. |

### Event Custom Parameters

| Parameter | Description |
| :--- | :--- |
| **Event Custom Parameters Object** | Provide a GTM variable that returns an object of custom key-value pairs. |
| **Event Custom Parameters** | Manually add up to 10 custom key-value pairs to be sent with the event. |

### Advanced Settings

#### Tag Execution Consent Settings

| Parameter | Description |
| :--- | :--- |
| **Ad Storage Consent** | If set to `required`, the tag will only fire if `ad_storage` consent has been granted. |

#### Logs Settings

| Parameter | Description |
| :--- | :--- |
| **Log Type** | Controls logging to the GTM console. Options are `Do not log`, `Log to console during debug and preview`, or `Always log to console`. |
| **BigQuery Logs Settings** | Configure the tag to send detailed request/response logs to a specified BigQuery table for monitoring and analysis. |

## Open Source
The **Viant for GTM Server-Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.

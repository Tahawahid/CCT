# Construction Client Tracker - Google Sheets Integration

This project integrates the Construction Client Tracker with Google Sheets for persistent data storage, including a **Cross-App Transfer System** that moves clients to different sheets (Accounting, CRM, etc.) upon completion.

## Features

- ✅ **Two-way sync** with Google Sheets
- ✅ **Cross-App Transfer System**: Automatically moves clients to destination sheets (Accounting, CRM, Warranty, Maintenance)
- ✅ **Automatic save** on changes (debounced)
- ✅ **Sync status indicator**
- ✅ **LocalStorage fallback** if Sheets unavailable
- ✅ **Periodic sync check** (every 5 minutes)
- ✅ **Error handling** and offline support

## Setup Instructions

### 1. Create Google Sheets Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name the first sheet tab **"Clients"**
4. Copy the **Sheet ID** from the URL (e.g., `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`)
5. Share the sheet with your Google Apps Script account (or make it editable by link if needed)

### 2. Create Google Apps Script

1. Go to [Google Apps Script](https://script.google.com)
2. Create a new project
3. Copy the contents of `Code.gs` into the script editor
4. **IMPORTANT**: Replace `YOUR_SHEET_ID` on line 6 with your actual Sheet ID from step 1
5. Save the project (Ctrl+S or Cmd+S)
6. Run the `setupSheet()` function **once** to create headers and destination sheets (click Run > setupSheet)
   - *Note: You may need to authorize permissions the first time.*
7. **Deploy as Web App**:
   - Click "Deploy" > "New deployment"
   - Click the gear icon ⚙️ next to "Select type" and choose "Web app"
   - Set:
     - **Description**: "Construction Client Tracker API"
     - **Execute as**: Me
     - **Who has access**: Anyone
   - Click "Deploy"
   - **Copy the Web App URL** (you'll need this for the frontend)

### 3. Update HTML Configuration

1. Open `js/app.js`
2. Find this line near the top:
   ```javascript
   const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL';
   ```
3. Replace `YOUR_APPS_SCRIPT_URL` with your **Web App URL** from step 2

### 4. Test Locally

1. Open `Clientmanager.html` in a web browser
2. The app should load clients from Google Sheets
3. Make changes and verify they save to Sheets
4. Try the **Transfer** feature:
   - Mark a client as "Ready to Transfer"
   - Click a destination (e.g., "Accounting")
   - Verify the client moves to the "Accounting_Clients" tab in your Google Sheet

### 5. Deploy to Vercel (Optional)

```bash
# Install Vercel CLI
npm i -g vercel

# In project folder
vercel

# Follow prompts and deploy
vercel --prod
```

## Cross-App Transfer System

The system automatically manages client lifecycle across different business functions.

**Workflow:**
1. **Active**: Client is in the "Clients" sheet.
2. **Ready to Transfer**: User marks client as ready.
3. **Transfer**: User selects destination (Accounting, CRM, Warranty, Maintenance).
4. **Archived**: Client is moved to the corresponding sheet (e.g., `Accounting_Clients`) and marked as "Transferred" in the main app.

**Destination Sheets:**
- `Clients` (Main Active Sheet)
- `Accounting_Clients`
- `CRM_Clients`
- `Warranty_Clients`
- `Maintenance_Clients`
- `Transferred_Clients` (Fallback)

## Data Structure

The Google Sheet will have these columns (automatically created by `setupSheet()`):

1. ID
2. Name
3. Urgency
4. Stage
5. StageStart
6. StageEnd
7. Location
8. Status
9. ReadyToTransfer
10. **TransferredTo** (New)
11. CurrentTaskName
12. CurrentTaskSubtasks
13. CurrentTaskDescription
14. CurrentTaskDue
15. CurrentTaskCreated
16. CurrentTaskTime
17. CurrentTaskContact
18. CurrentTaskCategory
19. AttachedClients
20. Notes
21. LastUpdated

## Troubleshooting

**Issue: "Apps Script URL not configured"**
- Solution: Update `APPS_SCRIPT_URL` in `js/app.js`

**Issue: CORS errors**
- Solution: Make sure Apps Script is deployed with "Anyone" access

**Issue: Data not saving**
- Solution: Check Apps Script logs (Executions > View executions)
- Verify Sheet ID is correct
- Ensure Sheet is shared with your Google account

**Issue: Transfer not working**
- Solution: Ensure `setupSheet()` was run to create destination sheets. Check if the destination sheet exists in your spreadsheet.

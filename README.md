# Construction Client Tracker - Google Sheets Integration

This project integrates the Construction Client Tracker with Google Sheets for persistent data storage.

## Setup Instructions

### 1. Create Google Sheets Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name the first sheet tab "Clients"
4. Copy the Sheet ID from the URL (e.g., `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`)
5. Share the sheet with your Google Apps Script account (or make it editable by link if needed)

### 2. Create Google Apps Script

1. Go to [Google Apps Script](https://script.google.com)
2. Create a new project
3. Copy the contents of `Code.gs` into the script editor
4. Replace `YOUR_SHEET_ID` with your actual Sheet ID
5. Save the project (Ctrl+S or Cmd+S)
6. Run the `setupSheet()` function once to create headers (click Run > setupSheet)
7. Deploy as Web App:
   - Click "Deploy" > "New deployment"
   - Click the gear icon ⚙️ next to "Select type" and choose "Web app"
   - Set:
     - Description: "Construction Client Tracker API"
     - Execute as: Me
     - Who has access: Anyone
   - Click "Deploy"
   - Copy the Web App URL (you'll need this)

### 3. Update HTML Configuration

1. Open `Clientmanager.html`
2. Find this line near the top of the `<script>` section:
   ```javascript
   const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL';
   ```
3. Replace `YOUR_APPS_SCRIPT_URL` with your Web App URL from step 2

### 4. Test Locally

1. Open `Clientmanager.html` in a web browser
2. The app should load clients from Google Sheets
3. Make changes and verify they save to Sheets
4. Check the sync status indicator (bottom right) to see sync status

### 5. Deploy to Vercel (Optional)

```bash
# Install Vercel CLI
npm i -g vercel

# In project folder
vercel

# Follow prompts and deploy
vercel --prod
```

## Features

- ✅ Two-way sync with Google Sheets
- ✅ Automatic save on changes (debounced)
- ✅ Sync status indicator
- ✅ LocalStorage fallback if Sheets unavailable
- ✅ Periodic sync check (every 5 minutes)
- ✅ Error handling and offline support

## Troubleshooting

**Issue: "Apps Script URL not configured"**
- Solution: Update `APPS_SCRIPT_URL` in `Clientmanager.html`

**Issue: CORS errors**
- Solution: Make sure Apps Script is deployed with "Anyone" access

**Issue: Data not saving**
- Solution: Check Apps Script logs (Executions > View executions)
- Verify Sheet ID is correct
- Ensure Sheet is shared with your Google account

**Issue: Sync status shows "Sync failed"**
- Solution: Check browser console for errors
- Verify Apps Script URL is correct
- Check if Sheet exists and has correct structure

## Data Structure

The Google Sheet should have these columns (in order):
1. ID
2. Name
3. Urgency
4. Stage
5. StageStart
6. StageEnd
7. Location
8. Status
9. ReadyToTransfer
10. CurrentTaskName
11. CurrentTaskSubtasks
12. CurrentTaskDescription
13. CurrentTaskDue
14. CurrentTaskCreated
15. CurrentTaskTime
16. CurrentTaskContact
17. CurrentTaskCategory
18. AttachedClients
19. Notes
20. LastUpdated

The `setupSheet()` function in `Code.gs` will create these headers automatically.

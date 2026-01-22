// Google Apps Script Backend for Construction Client Tracker
// Deploy this as a Web App with the following settings:
// - Execute as: Me
// - Who has access: Anyone

const SHEET_ID = '1koZKyU61Y9T4TcCfhJXgTJUHVPXTcWIv-dNyrRy2wLw'; // Replace with your Google Sheet ID
const MAIN_SHEET_NAME = 'Clients'; // Name of the main active clients sheet

// Map transfer destinations to sheet names
const DESTINATION_SHEETS = {
  'accounting': 'Accounting_Clients',
  'crm': 'CRM_Clients',
  'warranty': 'Warranty_Clients',
  'maintenance': 'Maintenance_Clients',
  'transferred': 'Transferred_Clients' // Fallback/Generic
};

/**
 * Handle GET requests - Load clients from Google Sheets
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(MAIN_SHEET_NAME);
    
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({error: `Sheet "${MAIN_SHEET_NAME}" not found`}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return ContentService
        .createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = data[0];
    const clients = data.slice(1).map(row => {
      const client = {};
      headers.forEach((header, index) => {
        let value = row[index];
        
        // Handle date values
        if (value instanceof Date) {
          value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
        
        // Handle boolean values
        if (typeof value === 'boolean') {
          value = value ? 'TRUE' : 'FALSE';
        }
        
        client[header] = value;
      });
      return client;
    });
    
    return ContentService
      .createTextOutput(JSON.stringify(clients))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests - Save/Update client in Google Sheets
 */
function doPost(e) {
  try {
    const client = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(MAIN_SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${MAIN_SHEET_NAME}" not found. Run setup first.`);
    }
    
    // Get headers
    let headers = [];
    if (sheet.getLastRow() > 0) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    } else {
      headers = getHeaders();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // Prepare row data
    const rowData = prepareRowData(client, headers);
    
    // Find existing row
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === client.ID.toString()) {
        rowIndex = i + 1;
        break;
      }
    }
    
    // Handle Transfer Logic
    if (client.Status === 'transferred' && client.TransferredTo) {
      const destSheetName = DESTINATION_SHEETS[client.TransferredTo] || DESTINATION_SHEETS['transferred'];
      let destSheet = ss.getSheetByName(destSheetName);
      
      // Create destination sheet if it doesn't exist
      if (!destSheet) {
        destSheet = ss.insertSheet(destSheetName);
        destSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        destSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        destSheet.setFrozenRows(1);
      }
      
      // Add to destination sheet
      destSheet.appendRow(rowData);
      
      // Update status in main sheet (or delete if you prefer to remove it completely)
      // Here we update it to mark it as transferred
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true, 
          transferred: true, 
          destination: destSheetName
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Normal Save (Not Transferred)
    if (rowIndex === -1) {
      sheet.appendRow(rowData);
      rowIndex = sheet.getLastRow();
    } else {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({success: true, rowIndex: rowIndex}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function prepareRowData(client, headers) {
  return headers.map(header => {
    let value = client[header];
    
    // Handle date strings
    if (header.includes('Date') || header.includes('Start') || header.includes('End') || header.includes('Created') || header.includes('Due')) {
      if (value && typeof value === 'string') {
        try {
          value = new Date(value);
        } catch (e) {
          value = value;
        }
      }
    }
    
    // Handle boolean
    if (header === 'ReadyToTransfer') {
      value = value === true || value === 'TRUE' || value === 'true';
    }
    
    return value || '';
  });
}

function getHeaders() {
  return [
    'ID', 'Name', 'Phone', 'Urgency', 'Stage', 'PipelineStage', 'StageStart', 'StageEnd', 
    'Location', 'Status', 'ReadyToTransfer', 'TransferredTo', 'CurrentTaskName', 
    'CurrentTaskSubtasks', 'CurrentTaskDescription', 'CurrentTaskDue',
    'CurrentTaskCreated', 'CurrentTaskTime', 'CurrentTaskContact',
    'CurrentTaskCategory', 'AttachedClients', 'CustomFields', 'Notes', 'LastUpdated'
  ];
}

/**
 * Setup function - Run this once to initialize your sheet structure
 */
function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(MAIN_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(MAIN_SHEET_NAME);
  }
  
  const headers = getHeaders();
  
  // Setup Main Sheet
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  // Setup Destination Sheets (Optional - they will be created on demand, but good to have)
  Object.values(DESTINATION_SHEETS).forEach(sheetName => {
    let destSheet = ss.getSheetByName(sheetName);
    if (!destSheet) {
      destSheet = ss.insertSheet(sheetName);
      destSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      destSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      destSheet.setFrozenRows(1);
    }
  });
  
  Logger.log('Sheet setup complete!');
}

function doOptions(e) {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.JSON);
}

const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

// Shared Cypress configuration factory.
// Per-environment configs (cypress.config.js for QA, cypress.stage.config.js for Stage)
// import this and inject only the environment-specific URLs.
function buildConfig({ baseUrl, env: envOverrides }) {
  return {
    // projectId: '', // Set your own Cypress Cloud project id if you use the dashboard
    reporter: 'cypress-mochawesome-reporter', // Use the Mochawesome reporter for generating test reports
    reporterOptions: {
      reportDir: 'cypress/results', // Directory where reports will be saved
      charts: true, // Include charts in the report for visual representation of test results
      reportPageTitle: 'StockWise Test Report', // Custom title for the report page
      embeddedScreenshots: true, // Embed screenshots directly in the report for better readability
      inlineAssets: true, // Inline CSS/JS assets so the report is a single self-contained HTML file
      saveAllAttempts: false, // Only save screenshots for failed attempts, not for retries
      overwrite: false, // Do not overwrite existing reports, create new ones for each run
      html: true, // Generate HTML report for easy viewing
      json: true, // Generate JSON report for CI integration and debugging
    },
    viewportWidth: 1920, // Setting the default viewport width to 1920px for desktop testing
    viewportHeight: 1080, // Setting the default viewport height to 1080px for desktop testing
    defaultCommandTimeout: 50000, // Global timeout for cy.get, cy.contains, etc.
    requestTimeout: 30000, // For cy.request()
    // Raised from 15s: a briefly-slow QA/Stage server can take >15s to return
    // the initial document/response for a cy.visit, surfacing as an
    // ESOCKETTIMEDOUT network-level failure. 60s gives slow loads room without
    // affecting fast ones (it is an upper bound, not a fixed wait).
    responseTimeout: 60000, // For cy.wait() and the cy.visit response
    pageLoadTimeout: 120000, // For cy.visit() — allow slow page loads to settle
    env: {
      // Environment-specific URLs injected by the per-env config
      ...envOverrides,
      // Shared credentials and grep flags (identical across QA and Stage)
      email: "user", // Placeholder — inject the real value via CI secrets
      pass: "password", // Placeholder — inject the real value via CI secrets
      grepFilterSpecs: true, // Enable filtering of test specs based on grep patterns
      grepOmitFiltered: true, // Omit filtered tests from the test run
    },
    e2e: {
      baseUrl: baseUrl,
      watchForFileChanges: false, // Automatically rerun tests when files change
      experimentalStudio: true, // Enable Cypress Studio for interactive test creation and debugging

      retries: {
        runMode: 0, // How many times to retry in CI
        openMode: 0, // How many times to retry when using "npx cypress open"
      },
      screenshotOnRunFailure: true, // Capture screenshots on test failure
      setupNodeEvents(on, config) {
        require('cypress-mochawesome-reporter/plugin')(on);
        require('@bahmutov/cy-grep/src/plugin')(config);
        on("task", {
          createExcelFile({ filePath, data }) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  if (data.length > 0) {
    // FIX: Collect ALL unique headers across every row — not just data[0]
    // This handles mixed rows where some rows have Serial Number and some don't
    const headers = [
      ...new Set(data.flatMap((row) => Object.keys(row))),
    ];

    // Write header row
    worksheet.addRow(headers);

    // Write each data row — look up value by header name so columns align
    // Rows missing a column (e.g. RAM row has no Serial Number) get undefined → blank cell
    data.forEach((row) => {
      const values = headers.map((header) => row[header] ?? "");
      worksheet.addRow(values);
    });
  }

  return workbook.xlsx.writeFile(filePath).then(() => {
    return `Excel file created: ${filePath}`;
  });
},
          createMultiSheetExcel({ filePath }) {
            const workbook = new ExcelJS.Workbook();
            // Add a Category header to each sheet so the BE reaches the
            // actualRowCount<=1 check and throws EmptyExcelException.
            // Without headers the BE does `continue` (no Category column) and
            // returns success:true/successCount:0 → FE navigates without dialog.
            const ws1 = workbook.addWorksheet("Sheet1");
            ws1.addRow(["Category", "Cost", "RAMbrand"]);
            const ws2 = workbook.addWorksheet("Sheet2");
            ws2.addRow(["Category", "Cost", "Brand"]);
            return workbook.xlsx.writeFile(filePath).then(() => {
              return `Multi-sheet Excel created at ${filePath}`;
            });
          },
          createHeaderOnlyExcel({ filePath, headers }) {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Sheet1");
            worksheet.addRow(headers);
            return workbook.xlsx.writeFile(filePath).then(() => {
              return `Header-only Excel created at ${filePath}`;
            });
          },
          createPlainFile({ filePath, content }) {
            fs.writeFileSync(filePath, content || "plain text content");
            return `Plain file created at ${filePath}`;
          },
          createExcelWithDuplicateHeader({ filePath, data, duplicateHeader }) {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Sheet1");
            if (data.length > 0) {
              const headers = Object.keys(data[0]);
              headers.push(duplicateHeader);
              worksheet.addRow(headers);
              data.forEach((row) => {
                const values = Object.values(row);
                values.push("");
                worksheet.addRow(values);
              });
            }
            return workbook.xlsx.writeFile(filePath).then(() => {
              return `Excel with duplicate header created at ${filePath}`;
            });
          },
          readSerialNumber(filePath) {
            if (!fs.existsSync(filePath)) {
              return `File not found: ${filePath}`;
            }

            return new ExcelJS.Workbook().xlsx
              .readFile(filePath)
              .then((workbook) => {
                const worksheet = workbook.getWorksheet("Sheet1");
                if (!worksheet) return `Sheet1 not found`;

                // Extract all serial numbers from column 4 (excluding the header)
                let serialNumbers = [];
                worksheet.eachRow((row, rowNumber) => {
                  if (rowNumber > 1) {
                    // Skip header row
                    let serialNumber = row.getCell(4).value; // Column 4 = Serial Number
                    if (serialNumber) {
                      serialNumbers.push(serialNumber);
                    }
                  }
                });

                return serialNumbers.length > 0
                  ? serialNumbers
                  : ["No serial numbers found"];
              });
          },
          deleteTestExcelFiles() {

            let dirPath = "cypress/fixtures/";
            let filePattern =
            /^(ItemTestFile|ProductTestFile|VariantTestFile|ImpTest|ImpTestProductOnly)-.+$/;
            if (fs.existsSync("cypress/downloads/Inventory.xlsx")) {
              dirPath = "cypress/downloads/";
              filePattern = /^inventory.xlsx$/i;
            }

            fs.readdirSync(dirPath).forEach((file) => {
              if (filePattern.test(file)) {
                fs.unlinkSync(path.join(dirPath, file));
                console.log(`Deleted: ${file}`);
              }
            });

            return null; // Task requires returning a value
          },
          readExcelFile(fileType) {
            const dirPath = "cypress/fixtures/";
            const filePattern = new RegExp(`^${fileType}TestFile-.*\\.xlsx$`);

            // Find all matching files and get the most recent one
            const matchingFiles = fs
              .readdirSync(dirPath)
              .filter((file) => filePattern.test(file))
              .map((file) => ({
                name: file,
                path: path.join(dirPath, file),
                time: fs.statSync(path.join(dirPath, file)).mtime.getTime()
              }))
              .sort((a, b) => b.time - a.time); // Sort by most recent first

            if (matchingFiles.length === 0) {
              throw new Error(
                `No matching ${fileType}TestFile found in ${dirPath}`
              );
            }

            const filePath = matchingFiles[0].path;
            console.log(`Reading most recent file: ${matchingFiles[0].name}`);

            return new ExcelJS.Workbook().xlsx
              .readFile(filePath)
              .then((workbook) => {
                const worksheet = workbook.getWorksheet("Sheet1");
                if (!worksheet) return `Sheet1 not found`;

                // Extract all serial numbers from column 4 (excluding the header)
                let serialNumbers = [];
                worksheet.eachRow((row, rowNumber) => {
                  if (rowNumber > 1) {
                    // Skip header row
                    let serialNumber = row.getCell(4).value; // Column 4 = Serial Number
                    if (serialNumber) {
                      serialNumbers.push(serialNumber);
                    }
                  }
                });

                return serialNumbers.length > 0
                  ? serialNumbers
                  : ["No serial numbers found"];
              });
          },
          readItemExcelFileFullData(fileType) {
            const dirPath = "cypress/fixtures/";
            const filePattern = new RegExp(`^${fileType}TestFile-.*\\.xlsx$`);

            // Find all matching files and get the most recent one
            const matchingFiles = fs
              .readdirSync(dirPath)
              .filter((file) => filePattern.test(file))
              .map((file) => ({
                name: file,
                path: path.join(dirPath, file),
                time: fs.statSync(path.join(dirPath, file)).mtime.getTime()
              }))
              .sort((a, b) => b.time - a.time); // Sort by most recent first

            if (matchingFiles.length === 0) {
              throw new Error(
                `No matching ${fileType}TestFile found in ${dirPath}`
              );
            }

            const filePath = matchingFiles[0].path;
            console.log(`Reading most recent file for full data: ${matchingFiles[0].name}`);

            return new ExcelJS.Workbook().xlsx
              .readFile(filePath)
              .then((workbook) => {
                const worksheet = workbook.getWorksheet("Sheet1");
                if (!worksheet) return `Sheet1 not found`;

                // Extract all rows including headers
                let rows = [];
                worksheet.eachRow((row, rowNumber) => {
                  const rowValues = [];
                  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    rowValues.push(cell.value);
                  });
                  rows.push(rowValues);
                });

                return rows.length > 0 ? rows : ["No data found"];
              });
          },
          readDownloadedFile() {
            const dirPath = "cypress/downloads/";
            const filePattern = /^inventory.*\.xlsx$/i;

            // Find the first matching file
            const matchingFile = fs
              .readdirSync(dirPath)
              .find((file) => filePattern.test(file));

            if (!matchingFile) {
              throw new Error(`No matching Inventory file found in ${dirPath}`);
            }

            const filePath = path.join(dirPath, matchingFile);

            return new ExcelJS.Workbook().xlsx.readFile(filePath).then((workbook) => {
              const worksheet = workbook.worksheets[0]; // get the first sheet

              if (!worksheet) {
                return "No worksheet found in the Excel file";
              }

              let rows = [];

              worksheet.eachRow((row, rowNumber) => {


                const rowValues = row.values.slice(1); // Remove the first column (usually null)
                rows.push(rowValues);

              });

              return rows.length > 0 ? rows : ["No data found"];
            });
          },
          writeLog({ filePath, message }) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const line = `[${new Date().toISOString()}] ${message}\n`;
            fs.appendFileSync(filePath, line, 'utf8');
            return null;
          },
          checkFileExists({ folderPath, filePattern }) {
            try {
              if (!fs.existsSync(folderPath)) {
                return null;
              }
              const files = fs.readdirSync(folderPath);
              const matchingFile = files.find((file) => {
                const pattern = filePattern.replace(/\*/g, ".*");
                const regex = new RegExp(`^${pattern}$`);
                return regex.test(file);
              });
              if (matchingFile) {
                return path.join(folderPath, matchingFile);
              }
              return null;
            } catch (error) {
              return null;
            }
          },
          waitForDownload(filename) {
            return new Promise((resolve, reject) => {
              let timeout;
              let interval = setInterval(() => {
                if (fs.existsSync(path.join("cypress/downloads/", filename))) {
                  clearInterval(interval);
                  clearTimeout(timeout);
                  resolve(true);
                }
              }, 500);
              timeout = setTimeout(() => {
                clearInterval(interval);
                reject(`Timeout waiting for ${filename}`);
              }, 30000); // wait max 30s — server-side Excel generation for large POs can take >10s
            });
          },
          // Returns every worksheet (not just the first) as
          //   { fileName, sheets: { <name>: { headers: [...], rows: [{<header>: <value>, ...}, ...] } } }
          // Used by Incoming Inventory Export tests, which produce one sheet per category.
          readDownloadedWorkbook(filename) {
            const filePath = path.join("cypress/downloads/", filename);
            if (!fs.existsSync(filePath)) {
              throw new Error(`readDownloadedWorkbook: ${filePath} does not exist`);
            }
            return new ExcelJS.Workbook().xlsx.readFile(filePath).then((workbook) => {
              const sheets = {};
              workbook.worksheets.forEach((ws) => {
                // .values is 1-indexed; index 0 is always null. Slice it off.
                const rawHeaders = (ws.getRow(1).values || []).slice(1);
                const headers = rawHeaders.map((h) => (h == null ? "" : String(h).trim()));
                const rows = [];
                ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                  if (rowNumber === 1) return;
                  const obj = {};
                  headers.forEach((header, i) => {
                    if (!header) return;
                    const cell = row.getCell(i + 1).value;
                    obj[header] = cell == null ? "" : cell;
                  });
                  rows.push(obj);
                });
                sheets[ws.name] = { headers, rows };
              });
              return { fileName: filename, sheets };
            });
          },
          // Read a downloaded CSV (Incoming Inventory client-side export) and
          // return { fileName, headers, rows } where rows is an array of
          // objects keyed by header. Handles quoted fields and embedded commas.
          readDownloadedCsv(filename) {
            const filePath = path.join("cypress/downloads/", filename);
            if (!fs.existsSync(filePath)) {
              throw new Error(`readDownloadedCsv: ${filePath} does not exist`);
            }
            const text = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
            // Minimal RFC-4180 line/field parser (handles quoted fields,
            // escaped "" quotes, and commas/newlines inside quotes).
            const records = [];
            let field = "";
            let row = [];
            let inQuotes = false;
            for (let i = 0; i < text.length; i += 1) {
              const ch = text[i];
              if (inQuotes) {
                if (ch === '"') {
                  if (text[i + 1] === '"') { field += '"'; i += 1; }
                  else inQuotes = false;
                } else field += ch;
              } else if (ch === '"') {
                inQuotes = true;
              } else if (ch === ",") {
                row.push(field); field = "";
              } else if (ch === "\n") {
                row.push(field); field = "";
                records.push(row); row = [];
              } else if (ch !== "\r") {
                field += ch;
              }
            }
            if (field.length || row.length) { row.push(field); records.push(row); }
            // Drop any trailing empty record(s).
            const nonEmpty = records.filter(
              (r) => r.length && !(r.length === 1 && r[0] === "")
            );
            const headers = (nonEmpty[0] || []).map((h) => String(h).trim());
            const rows = nonEmpty.slice(1).map((r) => {
              const obj = {};
              headers.forEach((h, i) => { obj[h] = r[i] == null ? "" : r[i]; });
              return obj;
            });
            return { fileName: filename, headers, rows };
          },
          // Remove a single downloaded artifact by filename. Used in after()
          // hooks so per-PO downloads don't accumulate between runs.
          deleteDownloadedFile(filename) {
            const filePath = path.join("cypress/downloads/", filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              return `Deleted ${filename}`;
            }
            return `Not found: ${filename}`;
          },
          async uploadExcelToApi({ filePath, poNumber, authToken, baseUrl }) {
            const FormData = (await import("form-data")).default;

            // A single upload attempt. The form stream can only be piped once,
            // so FormData is rebuilt per attempt by the retry wrapper below.
            const attemptUpload = () =>
              new Promise((resolve, reject) => {
                const form = new FormData();
                form.append("file", fs.createReadStream(filePath), {
                  filename: path.basename(filePath),
                  contentType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                });
                form.append("poNumber", poNumber);

                const url = new URL(`${baseUrl}/excel/upload-inventory`);
                const options = {
                  method: "POST",
                  hostname: url.hostname,
                  port: url.port || (url.protocol === "https:" ? 443 : 80),
                  path: url.pathname,
                  // Abort a hung socket so the retry wrapper can re-issue
                  // instead of waiting indefinitely on a stalled Stage proxy.
                  timeout: 120000,
                  headers: {
                    Authorization: `Bearer ${authToken}`,
                    ...form.getHeaders(),
                  },
                };
                const lib =
                  url.protocol === "https:" ? require("https") : require("http");
                const req = lib.request(options, (res) => {
                  let body = "";
                  res.on("data", (chunk) => (body += chunk));
                  res.on("end", () => {
                    try {
                      resolve({ status: res.statusCode, body: JSON.parse(body) });
                    } catch {
                      resolve({ status: res.statusCode, body: body });
                    }
                  });
                });
                req.on("timeout", () => req.destroy(new Error("ETIMEDOUT")));
                req.on("error", reject);
                form.pipe(req);
              });

            // Retry on transient network failures (ECONNRESET / ETIMEDOUT /
            // ECONNREFUSED / socket hang up) that the shared Stage proxy throws
            // intermittently. A rejected promise here fails the whole before()
            // hook, so a couple of retries with backoff makes seeding resilient.
            const isTransient = (err) => {
              const msg = `${err?.code || ""} ${err?.message || ""}`;
              return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|socket hang up|hang up/i.test(
                msg
              );
            };
            const maxAttempts = 3;
            let lastErr;
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              try {
                // eslint-disable-next-line no-await-in-loop
                return await attemptUpload();
              } catch (err) {
                lastErr = err;
                if (!isTransient(err) || attempt === maxAttempts) throw err;
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, 1000 * attempt));
              }
            }
            throw lastErr;
          },

          // Parse Excel headers from base64-encoded binary data (used by Download Template tests)
          async parseExcelHeaders({ base64Data }) {
            const workbook = new ExcelJS.Workbook();
            const buffer = Buffer.from(base64Data, "base64");
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.worksheets[0];
            if (!worksheet) return [];
            const headerRow = worksheet.getRow(1);
            const headers = [];
            for (let i = 1; i <= headerRow.cellCount; i++) {
              const val = String(headerRow.getCell(i).value ?? "").trim();
              if (val) headers.push(val);
            }
            return headers;
          }

        });

        return config;
      },
    },
  };
}

module.exports = { buildConfig };

// IndexedDB setup
const dbName = "WhatsAppToolsDB";
const dbVersion = 1;
let db;

console.log(typeof XLSX)

// Initialize the database
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("Could not open database");
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Database opened successfully");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create an object store for message history
      if (!db.objectStoreNames.contains("messageHistory")) {
        const store = db.createObjectStore("messageHistory", { keyPath: "id", autoIncrement: true });

        // Create indexes for faster queries
        store.createIndex("phoneNumber", "phoneNumber", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

// Call this when the extension loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    updateNumberCount();
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
});

// Toggle functionality
document.getElementById('extractorToggle').addEventListener('click', () => {
  document.getElementById('extractorToggle').classList.add('active');
  document.getElementById('senderToggle').classList.remove('active');
  document.getElementById('extractorTool').classList.add('active');
  document.getElementById('senderTool').classList.remove('active');
});

document.getElementById('senderToggle').addEventListener('click', () => {
  document.getElementById('senderToggle').classList.add('active');
  document.getElementById('extractorToggle').classList.remove('active');
  document.getElementById('senderTool').classList.add('active');
  document.getElementById('extractorTool').classList.remove('active');
});

// Log tabs functionality
document.getElementById('logTab').addEventListener('click', () => {
  document.getElementById('logTab').classList.add('active');
  document.getElementById('failedTab').classList.remove('active');
  document.getElementById('status').classList.add('active');
  document.getElementById('failedNumbers').classList.remove('active');
});

document.getElementById('failedTab').addEventListener('click', () => {
  document.getElementById('failedTab').classList.add('active');
  document.getElementById('logTab').classList.remove('active');
  document.getElementById('failedNumbers').classList.add('active');
  document.getElementById('status').classList.remove('active');
});

// Helper function for parsing phone numbers
function parsePhoneNumbers(text) {
  return text
    .split(/[\n,]+/)
    .map(num => num.trim().replace(/[^0-9+]/g, ''))
    .filter(num => num.length > 0);
}

// Transfer button functionality
document.getElementById('transferToSender').addEventListener('click', () => {
  const extractedContent = document.getElementById('content').innerText;
  if (extractedContent && extractedContent !== "Click \"Extract\" to get numbers." &&
    extractedContent !== "No numbers found!" && extractedContent !== "Div not found on this page.") {
    document.getElementById('numbers').value = extractedContent;
    document.getElementById('senderToggle').click();
    updateNumberCount();
  } else {
    alert("No numbers to transfer!");
  }
});

// Number Extractor functionality
document.getElementById("extract").addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractNumbers
  }).then((results) => {
    let extractedText = results[0].result || "No numbers found!";
    document.getElementById("content").innerText = extractedText;
  });
});

// Content script function for extracting numbers
function extractNumbers() {
  let div = document.querySelector(".x78zum5.x1cy8zhl.xisnujt.x1nxh6w3.xcgms0a.x16cd2qt");

  if (div) {
    let extractedContent = div.innerText;
    let phoneNumbers = extractedContent.match(/\+?\d{1,3} \d{5} \d{5}/g);
    return phoneNumbers ? phoneNumbers.join("\n") : "No numbers found!";
  } else {
    return "Div not found on this page.";
  }
}

document.getElementById("copy").addEventListener("click", () => {
  let content = document.getElementById("content").innerText;

  if (content.trim() && content !== "Click \"Extract\" to get numbers.") {
    navigator.clipboard.writeText(content).then(() => {
      alert("Copied to clipboard!");
    }).catch(err => {
      console.error("Failed to copy: ", err);
    });
  } else {
    alert("No numbers to copy!");
  }
});

// Save message to IndexedDB
function saveMessageHistory(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    const transaction = db.transaction(["messageHistory"], "readwrite");
    const store = transaction.objectStore("messageHistory");

    const record = {
      phoneNumber,
      message,
      timestamp,
      status: 'sent'
    };

    const request = store.add(record);

    request.onsuccess = () => {
      console.log('Message history updated');
      resolve();
    };

    request.onerror = (event) => {
      console.error("Error saving message:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Filter already contacted numbers using IndexedDB
function filterAlreadyContacted(numbers) {
  return new Promise((resolve) => {
    const transaction = db.transaction(["messageHistory"], "readonly");
    const store = transaction.objectStore("messageHistory");
    const index = store.index("phoneNumber");
    const contactedNumbers = new Set();

    // Get all unique phone numbers from history
    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        contactedNumbers.add(cursor.value.phoneNumber);
        cursor.continue();
      } else {
        // All entries have been processed
        const newNumbers = numbers.filter(number => !contactedNumbers.has(number));
        resolve({
          newNumbers,
          alreadyContacted: numbers.length - newNumbers.length
        });
      }
    };

    request.onerror = (event) => {
      console.error("Error filtering numbers:", event.target.error);
      resolve({ newNumbers: numbers, alreadyContacted: 0 });
    };
  });
}

// Export history to Excel
function exportToExcel() {
  const transaction = db.transaction(["messageHistory"], "readonly");
  const store = transaction.objectStore("messageHistory");
  const request = store.getAll();

  request.onsuccess = (event) => {
    const history = event.target.result;

    if (history.length === 0) {
      alert('No message history to export');
      return;
    }

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Format data for Excel
    const data = history.map(entry => ({
      'Phone Number': entry.phoneNumber,
      'Message': entry.message,
      'Timestamp': entry.timestamp,
      'Status': entry.status
    }));

    // Convert to worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Message History");

    // Generate Excel file and trigger download
    XLSX.writeFile(wb, "whatsapp_message_history.xlsx");
  };

  request.onerror = (event) => {
    console.error("Error exporting history:", event.target.error);
    alert('Failed to export message history');
  };
}

// Clear message history from IndexedDB
function clearMessageHistory() {
  if (confirm('Are you sure you want to clear all message history? This cannot be undone.')) {
    const transaction = db.transaction(["messageHistory"], "readwrite");
    const store = transaction.objectStore("messageHistory");
    const request = store.clear();

    request.onsuccess = () => {
      alert('Message history cleared successfully');
      logMessage('✅ Message history cleared');
    };

    request.onerror = (event) => {
      console.error("Error clearing history:", event.target.error);
      alert('Failed to clear message history');
    };
  }
}

// Bulk Sender functionality
function updateNumberCount() {
  const numbers = parsePhoneNumbers(document.getElementById('numbers')?.value || "");
  if (document.getElementById('numberCount')) {
    document.getElementById('numberCount').innerText = `Total Numbers: ${numbers.length}`;
  }
}

document.getElementById('numbers')?.addEventListener('input', updateNumberCount);

// Add filter, export, and clear buttons to the DOM
const numberCountDiv = document.getElementById('numberCount');
if (numberCountDiv) {
  const filterControlsDiv = document.createElement('div');
  filterControlsDiv.className = 'filter-controls';
  filterControlsDiv.innerHTML = `
    <button id="filterContacted" class="blue-btn">Filter Already Contacted</button>
    <button id="exportHistory" class="blue-btn">Export to Excel</button>
    <button id="clearHistory" class="blue-btn">Clear History</button>
  `;
  numberCountDiv.parentNode.insertBefore(filterControlsDiv, numberCountDiv.nextSibling);

  // Add CSS for the controls
  const style = document.createElement('style');
  style.textContent = `
  .filter-controls {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .filter-controls button {
    flex: 1;
    margin: 0 3px;
    font-size: 11px;
    padding: 6px 3px;
  }
  `;
  document.head.appendChild(style);
}

// Filter already contacted numbers
document.getElementById('filterContacted')?.addEventListener('click', async () => {
  const numbersText = document.getElementById('numbers').value;
  if (!numbersText.trim()) {
    alert("Please enter phone numbers first");
    return;
  }

  const numbers = parsePhoneNumbers(numbersText);
  const result = await filterAlreadyContacted(numbers);

  if (result.alreadyContacted > 0) {
    if (result.newNumbers.length === 0) {
      alert(`All ${numbers.length} numbers have been contacted before.`);
    } else {
      if (confirm(`${result.alreadyContacted} numbers have been contacted before. Remove them from the list?`)) {
        document.getElementById('numbers').value = result.newNumbers.join('\n');
        updateNumberCount();
        logMessage(`✅ Removed ${result.alreadyContacted} previously contacted numbers.`);
      }
    }
  } else {
    alert("None of these numbers have been contacted before.");
  }
});

// Export history to Excel
document.getElementById('exportHistory')?.addEventListener('click', exportToExcel);

// Clear message history
document.getElementById('clearHistory')?.addEventListener('click', clearMessageHistory);

const logContainer = document.getElementById('status');
const failedNumbersContainer = document.getElementById('failedNumbers');
const timeRemainingEl = document.getElementById('timeRemaining');

function logMessage(text) {
  let logEntry = document.createElement('div');
  logEntry.textContent = text;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Function to add a failed number only if it hasn't already been added
function addFailedNumber(number) {
  // Check if this number is already in the failed numbers list
  const existingEntries = Array.from(failedNumbersContainer.children)
    .filter(child => child.className === 'number-entry')
    .map(child => child.firstChild.textContent.trim());

  if (existingEntries.includes(number)) {
    return; // Skip if already added
  }

  if (failedNumbersContainer.textContent === 'No failed numbers yet.') {
    failedNumbersContainer.textContent = '';

    // Add a copy all button at the top
    const copyAllBtn = document.createElement('button');
    copyAllBtn.textContent = '📋 Copy All';
    copyAllBtn.className = 'copy-btn';
    copyAllBtn.onclick = () => {
      const allNumbers = Array.from(failedNumbersContainer.children)
        .filter(child => child.className === 'number-entry')
        .map(child => child.firstChild.textContent.trim())
        .join('\n');

      if (allNumbers) {
        navigator.clipboard.writeText(allNumbers).then(() => {
          copyAllBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            copyAllBtn.textContent = '📋 Copy All';
          }, 1000);
        });
      }
    };
    failedNumbersContainer.appendChild(copyAllBtn);
  }

  // Create container for number and copy button
  const entryContainer = document.createElement('div');
  entryContainer.className = 'number-entry';

  // Create text element for the number
  const failedEntry = document.createElement('span');
  failedEntry.textContent = number;
  entryContainer.appendChild(failedEntry);

  // Create copy button for this number
  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = '📋';
  copyBtn.className = 'copy-icon';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(number).then(() => {
      copyBtn.innerHTML = '✓';
      setTimeout(() => {
        copyBtn.innerHTML = '📋';
      }, 1000);
    });
  };
  entryContainer.appendChild(copyBtn);

  failedNumbersContainer.appendChild(entryContainer);
  failedNumbersContainer.scrollTop = failedNumbersContainer.scrollHeight;

  // Update the tab to show there are failed numbers (visual indicator)
  document.getElementById('failedTab').style.color = '#ff6b6b';
}

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request) => {
  if (request.log) {
    logMessage(request.log);
  }
  if (request.failedNumber) {
    addFailedNumber(request.failedNumber);
  }
});

// Content script function for sending WhatsApp messages
function sendWhatsAppMessage(message, phoneNumber) {
  // Reset the flag for each new message attempt
  window.scriptAlreadyExecuted = false;

  if (window.scriptAlreadyExecuted) return false;
  window.scriptAlreadyExecuted = true;

  function sendLogToPopup(text) {
    chrome.runtime.sendMessage({ log: text });
  }

  function reportFailedNumber(number) {
    chrome.runtime.sendMessage({ failedNumber: number });
  }

  sendLogToPopup("⏳ Waiting for WhatsApp chat to load...");

  return new Promise(async (resolve) => {
    let retries = 10;
    let messageInput;

    // Check for invalid number page
    const invalidNumberCheck = () => {
      return (
        document.querySelector('div[data-animate-modal-body="true"]') ||
        document.querySelector('div._3J6wB') ||
        document.body.textContent.includes('Phone number shared via url is invalid')
      );
    };

    // Wait for either the chat to load or an error to appear
    while (retries > 0) {
      messageInput = document.querySelector(
        'div[contenteditable="true"][aria-label="Type a message"]'
      );

      // Check for invalid number error
      if (invalidNumberCheck()) {
        sendLogToPopup(`❌ Invalid phone number: ${phoneNumber}`);
        reportFailedNumber(phoneNumber);
        resolve(false);
        return;
      }

      if (messageInput) break;

      // Wait for a short period before retrying
      await new Promise((resolve) => setTimeout(resolve, 400));
      retries--;
    }

    if (!messageInput) {
      sendLogToPopup(`❌ Message input box not found for: ${phoneNumber}`);
      reportFailedNumber(phoneNumber);
      resolve(false);
      return;
    }

    sendLogToPopup('✅ Chat loaded. Typing message...');
    messageInput.innerHTML = '';
    messageInput.focus();
    document.execCommand('insertText', false, message);
    await new Promise((resolve) => setTimeout(resolve, 800));

    sendLogToPopup('✅ Message typed. Sending...');

    messageInput.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
    sendLogToPopup(`✅ Message sent to ${phoneNumber}`);
    resolve(true);
  });
}

// Main function for sending messages
document.getElementById('start')?.addEventListener('click', async () => {
  console.log("Start button clicked"); // Debug log
  const startButton = document.getElementById('start');

  // Change button color to red and text to indicate process is running
  startButton.style.background = '#ff4d4d'; // Red color
  startButton.textContent = 'Sending...';
  startButton.disabled = true; // Optionally disable the button while sending

  const numbers = parsePhoneNumbers(document.getElementById('numbers').value);
  const message = encodeURIComponent(document.getElementById('message').value.trim());

  if (numbers.length === 0 || !message) {
    alert("❌ Please enter at least one phone number and a message.");
    // Reset button if validation fails
    startButton.style.background = '#25D366';
    startButton.textContent = 'Start Sending';
    startButton.disabled = false;
    return;
  }

  // Reset failed numbers container
  failedNumbersContainer.textContent = 'No failed numbers yet.';
  document.getElementById('failedTab').style.color = 'white';

  // Clear log container
  logContainer.textContent = '';

  const totalCount = numbers.length;
  const estimatedTimePerMessage = 8;
  let totalRemainingTime = totalCount * estimatedTimePerMessage;

  function updateRemainingTime() {
    const hours = String(Math.floor(totalRemainingTime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalRemainingTime % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalRemainingTime % 60).padStart(2, '0');
    timeRemainingEl.textContent = `${hours}:${minutes}:${seconds}`;
  }

  updateRemainingTime();
  document.getElementById('progress').firstElementChild.innerText = `Sent: 0 | Remaining: ${totalCount}`;

  const timerInterval = setInterval(() => {
    if (totalRemainingTime > 0) {
      totalRemainingTime--;
      updateRemainingTime();
    } else {
      clearInterval(timerInterval);
    }
  }, 1000);

  try {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) {
        logMessage('❌ No active tab found!');
        // Reset button if no tab found
        startButton.style.background = '#25D366';
        startButton.textContent = 'Start Sending';
        startButton.disabled = false;
        clearInterval(timerInterval);
        return;
      }

      let tabId = tabs[0].id;
      let attemptedCount = 0; // Total messages attempted
      let successCount = 0;   // Successfully sent messages
      let failedCount = 0;    // Failed messages

      try {
        for (let i = 0; i < numbers.length; i++) {
          const number = numbers[i];
          let whatsappURL = `https://web.whatsapp.com/send?phone=${number}&text=${message}`;

          logMessage(`⏳ Opening chat for: ${number}...`);
          chrome.tabs.update(tabId, { url: whatsappURL });

          // Wait for WhatsApp Web to load
          await new Promise(resolve => setTimeout(resolve, 10000));

          const result = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            args: [decodeURIComponent(message), number],
            func: sendWhatsAppMessage,
          });

          const success = result[0]?.result;
          attemptedCount++;

          if (success === false) {
            // Message failed to send
            failedCount++;
            addFailedNumber(number);
            logMessage(`❌ Failed to send message to ${number}`);
          } else {
            // Message sent successfully
            successCount++;

            // Save message history to IndexedDB
            const decodedMessage = decodeURIComponent(message);
            try {
              await saveMessageHistory(number, decodedMessage);
            } catch (error) {
              console.error("Failed to save message history:", error);
            }
          }

          // Update progress with accurate counts
          document.getElementById('progress').firstElementChild.innerText =
            `Sent: ${successCount} | Remaining: ${totalCount - attemptedCount}`;
          updateRemainingTime();

          if (i < numbers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      } catch (error) {
        logMessage(`❌ Error during sending: ${error.message}`);
      } finally {
        clearInterval(timerInterval);
        timeRemainingEl.textContent = '00:00:00';

        // Reset button back to green
        startButton.style.background = '#25D366';
        startButton.textContent = 'Start Sending';
        startButton.disabled = false;

        // Final progress update to ensure accuracy
        document.getElementById('progress').firstElementChild.innerText =
          `Sent: ${successCount} | Remaining: ${totalCount - attemptedCount}`;

        // Completion message
        if (failedCount > 0) {
          logMessage(`🎉 ✅ Process complete! ${successCount} sent, ${failedCount} failed.`);
          document.getElementById('failedTab').style.color = '#ff6b6b';
        } else {
          logMessage('🎉 ✅ All messages sent successfully!');
        }
      }
    });
  } catch (error) {
    logMessage(`❌ Error: ${error.message}`);
    // Reset button if an error occurs
    startButton.style.background = '#25D366';
    startButton.textContent = 'Start Sending';
    startButton.disabled = false;
    clearInterval(timerInterval);
  }
});


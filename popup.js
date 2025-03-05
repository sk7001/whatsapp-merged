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

// Message history database functions
function saveMessageHistory(phoneNumber, message) {
  const timestamp = new Date().toISOString();

  chrome.storage.local.get(['messageHistory'], (result) => {
    const history = result.messageHistory || [];
    history.push({
      phoneNumber,
      message,
      timestamp,
      status: 'sent'
    });

    chrome.storage.local.set({ messageHistory: history }, () => {
      console.log('Message history updated');
    });
  });
}

// Function to filter out already contacted numbers
function filterAlreadyContacted(numbers) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['messageHistory'], (result) => {
      const history = result.messageHistory || [];
      const contactedNumbers = new Set(history.map(entry => entry.phoneNumber));

      const newNumbers = numbers.filter(number => !contactedNumbers.has(number));
      resolve({
        newNumbers,
        alreadyContacted: numbers.length - newNumbers.length
      });
    });
  });
}

// Function to export history to CSV
function exportToCSV() {
  chrome.storage.local.get(['messageHistory'], (result) => {
    const history = result.messageHistory || [];
    if (history.length === 0) {
      alert('No message history to export');
      return;
    }

    // Create CSV content
    const headers = ['Phone Number', 'Message', 'Timestamp', 'Status'];
    const csvContent = [
      headers.join(','),
      ...history.map(entry => [
        `"${entry.phoneNumber}"`,
        `"${entry.message.replace(/"/g, '""')}"`,
        `"${entry.timestamp}"`,
        `"${entry.status}"`
      ].join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `whatsapp_message_history_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Function to clear message history
function clearMessageHistory() {
  if (confirm('Are you sure you want to clear all message history? This cannot be undone.')) {
    chrome.storage.local.set({ messageHistory: [] }, () => {
      alert('Message history cleared successfully');
      logMessage('✅ Message history cleared');
    });
  }
}

// Bulk Sender functionality
function updateNumberCount() {
  const numbers = parsePhoneNumbers(document.getElementById('numbers').value);
  document.getElementById('numberCount').innerText = `Total Numbers: ${numbers.length}`;
}

document.getElementById('numbers').addEventListener('input', updateNumberCount);

// Add filter, export, and clear buttons to the DOM after the numberCount div
const numberCountDiv = document.getElementById('numberCount');
const filterControlsDiv = document.createElement('div');
filterControlsDiv.className = 'filter-controls';
filterControlsDiv.innerHTML = `
  <button id="filterContacted" class="blue-btn">Filter Already Contacted</button>
  <button id="exportHistory" class="blue-btn">Export History to CSV</button>
  <button id="clearHistory" class="blue-btn">Clear History</button>
`;
numberCountDiv.parentNode.insertBefore(filterControlsDiv, numberCountDiv.nextSibling);

// Add CSS for the new controls
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

// Filter already contacted numbers
document.getElementById('filterContacted').addEventListener('click', async () => {
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

// Export history to CSV
document.getElementById('exportHistory').addEventListener('click', exportToCSV);

// Clear message history
document.getElementById('clearHistory').addEventListener('click', clearMessageHistory);

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

// Main function for sending messages
document.getElementById('start').addEventListener('click', async () => {
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
      let attemptedCount = 0;  // Total messages attempted
      let successCount = 0;    // Successfully sent messages
      let failedCount = 0;     // Failed messages

      try {
        for (let i = 0; i < numbers.length; i++) {
          const number = numbers[i];
          let whatsappURL = `https://web.whatsapp.com/send?phone=${number}&text=${message}`;

          logMessage(`⏳ Opening chat for: ${number}...`);
          chrome.tabs.update(tabId, { url: whatsappURL });

          await new Promise(resolve => setTimeout(resolve, 8000));
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
          } else {
            // Message sent successfully
            successCount++;

            // Save message history
            const decodedMessage = decodeURIComponent(message);
            saveMessageHistory(number, decodedMessage);
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
          `Sent: ${successCount} | Remaining: 0`;

        // Completion message
        if (failedCount > 0) {
          logMessage(`🎉 ✅ Process complete! ${successCount} sent, ${failedCount} failed.`);
          // Highlight the failed tab
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

// Content script functions
function sendWhatsAppMessage(message, phoneNumber) {

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
    messageInput.innerHTML = ''; // Clear any existing content
    messageInput.focus();
    document.execCommand('insertText', false, message); // Insert the message text
    await new Promise((resolve) => setTimeout(resolve, 800)); // Wait briefly after typing

    sendLogToPopup('✅ Message typed. Sending...');

    // Simulate pressing the Enter key to send the message
    messageInput.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait briefly after sending

    sendLogToPopup(`✅ Message sent to ${phoneNumber}`);
    resolve(true); // Indicate success
  });
}

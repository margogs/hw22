// app.js - Add this line at the VERY TOP (line 1)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxEyDscrw71v-mLdOML0ElzpDhWcRdSD-pvmML_Kz2aCmhk95hZDgwnVVSEAfEgjGSo/exec';

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

// Global variables
let reviews = [];
let sentimentPipeline = null;

// DOM elements
const analyzeBtn = document.getElementById("analyze-btn");
const reviewText = document.getElementById("review-text");
const sentimentResult = document.getElementById("sentiment-result");
const loadingElement = document.querySelector(".loading");
const errorElement = document.getElementById("error-message");

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  loadReviews();
  analyzeBtn.addEventListener("click", analyzeRandomReview);
  initSentimentModel();
});

// Initialize transformers.js model
async function initSentimentModel() {
  try {
    sentimentPipeline = await pipeline(
      "text-classification",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
    );
    console.log("✅ Sentiment model loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load sentiment model:", error);
    showError("Failed to load sentiment model. Please refresh the page.");
  }
}

// Load reviews from TSV
function loadReviews() {
  fetch("reviews_test.tsv")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((tsvData) => {
      Papa.parse(tsvData, {
        header: true,
        delimiter: "\t",
        complete: (results) => {
          reviews = results.data
            .map((row) => row.text)
            .filter((text) => typeof text === "string" && text.trim() !== "");
          console.log(`📊 Loaded ${reviews.length} reviews`);
        },
        error: (error) => {
          console.error("❌ TSV parse error:", error);
        }
      });
    })
    .catch((error) => {
      console.error("❌ Failed to load TSV:", error);
    });
}

// Main function: Analyze random review
async function analyzeRandomReview() {
  hideError();

  // Validation
  if (!reviews.length) {
    showError("No reviews available. Please try again later.");
    return;
  }

  if (!sentimentPipeline) {
    showError("Sentiment model is not ready yet. Please wait a moment.");
    return;
  }

  // Select random review
  const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
  reviewText.textContent = selectedReview;

  // Show loading state
  loadingElement.style.display = "block";
  analyzeBtn.disabled = true;
  sentimentResult.innerHTML = "";
  sentimentResult.className = "sentiment-result";

  try {
    // 1. Analyze sentiment
    const result = await analyzeSentiment(selectedReview);
    const { sentiment, label, score } = displaySentiment(result);
    
    // 2. Log to Google Sheets with EXACT column format
    await logToGoogleSheets(selectedReview, sentiment, label, score);
    
    console.log("✅ Analysis complete and logged to Google Sheets");
    
  } catch (error) {
    console.error("❌ Error:", error);
    showError(error.message || "Failed to analyze sentiment.");
  } finally {
    // Reset UI
    loadingElement.style.display = "none";
    analyzeBtn.disabled = false;
  }
}

// NEW FUNCTION: Log data to Google Sheets with your exact column requirements
async function logToGoogleSheets(review, sentiment, label, score) {
  try {
    // Prepare data matching your column requirements:
    // 1. Timestamp (ts_iso)
    // 2. Review
    // 3. Sentiment (with confidence)
    // 4. Meta (all client information)
    
    const logData = {
      timestamp: new Date().toISOString(), // Column 1: Timestamp (ts_iso)
      review: review, // Column 2: Review
      sentiment: {
        label: label,
        category: sentiment,
        confidence: score
      },
      confidence: (score * 100).toFixed(1), // For the Sentiment column display
      meta: { // Column 4: Meta - ALL client information
        // Browser information
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages,
        
        // Device information
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
        
        // Screen information
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        screenColorDepth: window.screen.colorDepth,
        screenPixelDepth: window.screen.pixelDepth,
        
        // Time information
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        clientTimestamp: Date.now(),
        clientDate: new Date().toString(),
        
        // Connection information
        onlineStatus: navigator.onLine,
        connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
        
        // App information
        appVersion: '1.0',
        modelUsed: 'distilbert-base-uncased-finetuned-sst-2-english',
        
        // URL information
        url: window.location.href,
        referrer: document.referrer,
        
        // Performance information
        memory: navigator.deviceMemory || 'unknown',
        
        // Cookies enabled
        cookiesEnabled: navigator.cookieEnabled
      }
    };

    console.log('📤 Sending to Google Sheets:', logData);

    // Send to Google Apps Script
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logData)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Logged to Google Sheets:', result);
      return result;
    } else {
      const errorText = await response.text();
      console.warn('⚠️ Failed to log to Google Sheets:', response.status, errorText);
      // Don't throw error - logging is secondary functionality
    }
    
  } catch (error) {
    console.warn('⚠️ Network error when logging to Google Sheets:', error);
    // Silently fail - don't interrupt user experience
  }
}

// Analyze sentiment
async function analyzeSentiment(text) {
  if (!sentimentPipeline) {
    throw new Error("Sentiment model is not initialized.");
  }
  const output = await sentimentPipeline(text);
  return [output];
}

// Display sentiment result and return data
function displaySentiment(result) {
  let sentiment = "neutral";
  let score = 0.5;
  let label = "NEUTRAL";

  if (Array.isArray(result) && result[0] && result[0][0]) {
    const sentimentData = result[0][0];
    label = (sentimentData.label || "NEUTRAL").toUpperCase();
    score = sentimentData.score || 0.5;

    if (label === "POSITIVE" && score > 0.5) {
      sentiment = "positive";
    } else if (label === "NEGATIVE" && score > 0.5) {
      sentiment = "negative";
    }
  }

  // Update UI
  sentimentResult.classList.add(sentiment);
  sentimentResult.innerHTML = `
    <i class="fas ${getSentimentIcon(sentiment)} icon"></i>
    <span>${label} (${(score * 100).toFixed(1)}% confidence)</span>
  `;
    
  return { sentiment, label, score };
}

// Get sentiment icon
function getSentimentIcon(sentiment) {
  switch (sentiment) {
    case "positive": return "fa-thumbs-up";
    case "negative": return "fa-thumbs-down";
    default: return "fa-question-circle";
  }
}

// Error handling
function showError(message) {
  errorElement.textContent = message;
  errorElement.style.display = "block";
}

function hideError() {
  errorElement.style.display = "none";
}

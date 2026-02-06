// app.js (ES module version using transformers.js for local sentiment classification)
// ADD THIS CONSTANT AT THE TOP OF THE FILE - REPLACE WITH YOUR DEPLOYED APP SCRIPT URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxqqmgGOjQtIY5_scQwOETG0z4_vsk4VUxxvrEmXbnF9NXkgSR_1GUiAfPQ4oahhg/exec';

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
const apiTokenInput = document.getElementById("api-token");

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
    console.log("Sentiment model loaded");
  } catch (error) {
    console.error("Failed to load sentiment model:", error);
    showError("Failed to load sentiment model. Please refresh the page.");
  }
}

// Load reviews from TSV
function loadReviews() {
  fetch("reviews_test.tsv")
    .then((response) => response.text())
    .then((tsvData) => {
      Papa.parse(tsvData, {
        header: true,
        delimiter: "\t",
        complete: (results) => {
          reviews = results.data
            .map((row) => row.text)
            .filter((text) => typeof text === "string" && text.trim() !== "");
        }
      });
    })
    .catch((error) => {
      console.error("TSV load error:", error);
    });
}

// Analyze a random review
async function analyzeRandomReview() {
  hideError();

  if (!reviews.length) {
    showError("No reviews available. Please try again later.");
    return;
  }

  if (!sentimentPipeline) {
    showError("Sentiment model is not ready yet. Please wait a moment.");
    return;
  }

  const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
  reviewText.textContent = selectedReview;

  loadingElement.style.display = "block";
  analyzeBtn.disabled = true;
  sentimentResult.innerHTML = "";
  sentimentResult.className = "sentiment-result";

  try {
    const result = await analyzeSentiment(selectedReview);
    const { sentiment, label, score } = displaySentiment(result);
    
    // Log to Google Sheets
    await logToGoogleSheets(selectedReview, sentiment, label, score);
    
  } catch (error) {
    console.error("Error:", error);
    showError(error.message || "Failed to analyze sentiment.");
  } finally {
    loadingElement.style.display = "none";
    analyzeBtn.disabled = false;
  }
}

// NEW FUNCTION: Log data to Google Sheets
async function logToGoogleSheets(review, sentiment, label, score) {
  try {
    const logData = {
      timestamp: new Date().toISOString(),
      review: review,
      sentiment: {
        label: label,
        category: sentiment,
        confidence: score
      },
      confidence: (score * 100).toFixed(1),
      meta: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp_client: Date.now(),
        model: "distilbert-base-uncased-finetuned-sst-2-english"
      }
    };

    // Send data to Google Apps Script
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logData)
    });

    // Check if logging was successful
    if (response.ok) {
      const result = await response.json();
      console.log('Data logged to Google Sheets:', result);
    } else {
      console.warn('Failed to log to Google Sheets:', response.status);
    }
    
  } catch (error) {
    console.warn('Failed to log to Google Sheets (network error):', error);
    // Silently fail - logging is secondary functionality
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
    } else {
      sentiment = "neutral";
    }
  }

  sentimentResult.classList.add(sentiment);
  sentimentResult.innerHTML = `
    <i class="fas ${getSentimentIcon(sentiment)} icon"></i>
    <span>${label} (${(score * 100).toFixed(1)}% confidence)</span>
  `;
    
  return { sentiment, label, score };
}

// Get appropriate icon for sentiment
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

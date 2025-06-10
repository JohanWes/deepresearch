# Deep Research Test Suite

This directory contains tests for the Deep Research application.

## Mobile Carousel Touch Tests

### Running the Mobile Carousel Tests

```bash
# Run the mobile carousel touch test suite
node tests/mobile-carousel.test.js
```

### What the tests cover:

1. **CSS Mobile Touch Action** - Validates CSS allows horizontal touch movement
2. **Carousel HTML Structure** - Ensures required DOM elements exist
3. **JavaScript Touch Functions** - Confirms touch handlers are implemented
4. **Touch Event Binding** - Verifies events are properly bound
5. **Constraint Logic Simplicity** - Checks boundary logic is simple and correct
6. **Mobile Specific CSS** - Validates mobile-responsive styles
7. **Transition Handling** - Ensures smooth CSS transitions during touch
8. **Boundary Logic** - Tests swipe boundaries prevent over-scrolling

## Multi-LLM Feature Tests

### Running the Multi-LLM Tests

```bash
# Run the multi-LLM feature test suite
node tests/multi-llm.test.js
```

### What the tests cover:

1. **Models API Response Structure** - Validates the `/api/models` endpoint returns correct structure
2. **Models List Validation** - Ensures all expected models are present  
3. **Model Pricing Validation** - Checks model pricing is correctly configured
4. **Authentication Required** - Verifies endpoints require authentication
5. **Main Page HTML Structure** - Confirms model selector UI is present
6. **Search Endpoint Functionality** - Tests search functionality works
7. **Model Selection Persistence** - Validates model parameter acceptance

### Test Results

The test suite will:
- ✅ Start a test server automatically
- 🧪 Run all tests sequentially  
- 📋 Provide a detailed summary
- 🛑 Clean up resources automatically

### Expected Output

```
🏁 Starting Multi-LLM Feature Test Suite

🚀 Starting server for testing...
✅ Server started successfully

🧪 Running test: Models API Response Structure
   📊 Found 5 models
   🎯 Default model: google/gemini-2.5-flash-preview-05-20:thinking
✅ Models API Response Structure - PASSED

[... additional test output ...]

📋 Test Results Summary:
============================================================
✅ Models API Response Structure
✅ Models List Validation  
✅ Model Pricing Validation
✅ Authentication Required
✅ Main Page HTML Structure
✅ Search Endpoint Functionality
✅ Model Selection Persistence
============================================================
Total: 7 | Passed: 7 | Failed: 0
🎉 All tests passed! Multi-LLM feature is working correctly.
```

## Test Requirements

- Node.js with ES modules support
- `node-fetch` package for HTTP requests
- Server must be available to run on port 8006
- Valid session token configured in environment
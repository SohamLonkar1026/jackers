# Backend Update: Health Endpoint

## What was changed
- Modified `server.js` to include a new `/health` endpoint.
- Code added:
  ```javascript
  app.get('/health', (req, res) => {
    res.send('OK');
  });
  ```

## Why it was changed
- Implemented as per user request (Step 1). A health check endpoint is commonly used for load balancers or monitoring services to verify that the backend server is running and responding to HTTP requests.

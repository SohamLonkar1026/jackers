# Deploy to Render

This app is ready for online hosting on Render.

## Quick Deploy

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for Render deployment"
   git push origin main
   ```

2. **Deploy on Render**
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Use these settings:
     - **Runtime**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Health Check Path**: `/debug`

## What's Ready for Production

✅ **Port Configuration**: Uses `process.env.PORT` (Render's standard)  
✅ **CORS Enabled**: Socket.IO allows all origins  
✅ **Static Files**: Serves frontend from `/public`  
✅ **Health Check**: `/debug` endpoint for monitoring  
✅ **Git Ignore**: Excludes `node_modules`  
✅ **Render Config**: Pre-configured `render.yaml`

## Post-Deployment

Once deployed:
- **Admin Link**: `https://your-app.onrender.com`
- **Player Link**: Same URL (share with players)
- **No IP needed**: Works over internet, not LAN

## Notes

- Game state resets on each restart (in-memory storage)
- Multiple rooms can run simultaneously
- All features work: admin controls, settlements, animations

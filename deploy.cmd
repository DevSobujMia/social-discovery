@echo off
echo ==========================================
echo   Deploying CityHost to Google Cloud Run
echo ==========================================
gcloud run deploy cityhost-app --source . --region asia-south1 --allow-unauthenticated
echo.
echo Deployment finished! Visit https://cityhost.live
pause

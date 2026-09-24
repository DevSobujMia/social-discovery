# City Host

City Host is a trip-sharing site. Travellers post an upcoming trip. Locals who arrive from ads find who is visiting their city and message them on this site.

This used to be named Heartlink. The product name is now **City Host**.

## Run locally

```powershell
npm run go
```

Site: http://localhost:3000  
Admin: http://localhost:3000/admin

That command starts the database, creates tables, seeds profiles on first run, and opens the app.

| Command | What it does |
| :--- | :--- |
| `npm run go` / `npm run dev` / `start.cmd` | Database + website |
| `npm run db` | Database only |
| `npm run build` | Production build |
| `npm start` | Serve production build |

# GitHub Setup

This folder is ready to become a GitHub repository.

Expected commands when Git is available:

```powershell
cd "C:\Users\Hp\Documents\open ai\trinity-financial-dashboard"
git init
git add .
git commit -m "Initial Trinity financial dashboard"
git branch -M main
git remote add origin https://github.com/usman-creator/TrinityFinancials.git
git push -u origin main
```

Do not commit:

```text
config.js
.env
.env.*
```

Those are already covered by `.gitignore`.

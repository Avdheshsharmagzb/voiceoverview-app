# Auth Testing — Samvad (JWT Bearer)

Auth uses JWT Bearer tokens returned in the JSON body (not cookies). Frontend stores token in localStorage and sends `Authorization: Bearer <token>`.

## Seeded admin
- Email: admin@samvad.news
- Password: admin123

## API testing
```
# Login
curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@samvad.news","password":"admin123"}'
# -> { "access_token": "...", "user": {...} }

# Use token
TOKEN=<access_token>
curl -s http://localhost:8001/api/auth/me -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8001/api/news -H "Authorization: Bearer $TOKEN"

# Unauthed should 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/news   # 401
```

## Notes
- bcrypt hashes start with $2b$.
- Protected: /api/news (GET/POST), PATCH/DELETE /api/news/{id}, approve-rewrite, publish, /api/news/fetch
- Public: /api/public/news, /api/categories

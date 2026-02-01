# CaseFun - Web3 Gaming Platform

Your Token, Your Cases, Your Rules.

## Project Structure

```
casefun/
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── config/       # Database, env config
│   │   ├── models/       # Database models (Prisma)
│   │   ├── routes/       # API routes
│   │   ├── controllers/  # Business logic
│   │   ├── middleware/   # Auth, validation
│   │   └── index.ts      # Entry point
│   └── prisma/
│       └── schema.prisma # Database schema
├── frontend/         # React + TypeScript
│   └── src/
│       ├── components/   # React components
│       ├── hooks/        # Custom hooks
│       └── types.ts      # TypeScript types
├── docker-compose.yml    # PostgreSQL database
└── package.json         # Root scripts
```

## Tech Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT + ethers (wallet signature verification)

### Frontend
- **Framework**: React + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Web3**: ethers.js
- **Icons**: lucide-react

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- MetaMask browser extension

### Installation

1. **Clone and install dependencies**
```bash
npm run install:all
```

2. **Start database**
```bash
npm run db:start
```

3. **Setup environment variables**
```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# Frontend
cp frontend/.env.example frontend/.env.local
# Edit frontend/.env.local with your values
```

4. **Run database migrations**
```bash
cd backend
npm run db:push
# or
npm run migrate
```

5. **Start development servers**
```bash
# From root directory
npm run dev
```

This will start:
- Backend API: http://localhost:3001
- Frontend: http://localhost:5173

## Development

### Backend Development
```bash
npm run dev:backend
```

### Frontend Development
```bash
npm run dev:frontend
```

### Database Management
```bash
# Start database
npm run db:start

# Stop database
npm run db:stop

# Reset database (WARNING: deletes all data)
npm run db:reset

# Open Prisma Studio
cd backend && npm run db:studio
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with wallet signature
- `GET /api/auth/profile` - Get user profile (requires auth)

### Cases
- `GET /api/cases` - Get all active cases
- `GET /api/cases/:id` - Get case by ID
- `POST /api/cases` - Create new case (requires auth)
- `POST /api/cases/:caseId/open` - Open a case (requires auth)

### Health Check
- `GET /api/health` - Server health status

## Deployment

### Backend
1. Set `NODE_ENV=production`
2. Update `DATABASE_URL` with production database
3. Set strong `JWT_SECRET`
4. Run migrations: `npm run migrate:prod`
5. Build: `npm run build:backend`
6. Start: `npm run start:backend`

### Frontend
1. Update `VITE_API_URL` with production API URL
2. Build: `npm run build:frontend`
3. Deploy `frontend/dist` to static hosting (Vercel, Netlify, etc.)

## Environment Variables

### Backend (`backend/.env`)
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3001)
- `FRONTEND_URL` - Frontend URL for CORS
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT signing

### Frontend (`frontend/.env.local`)
- `VITE_API_URL` - Backend API URL

## Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request

## License

MIT

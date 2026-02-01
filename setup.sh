#!/bin/bash

echo "🎮 CaseFun - Автоматическая установка"
echo "======================================"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установи с https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js: $(node --version)"

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Установи Docker Desktop с https://www.docker.com/products/docker-desktop/"
    exit 1
fi

echo "✅ Docker: $(docker --version)"
echo ""

# Шаг 1: Установка зависимостей
echo "📦 Шаг 1/4: Установка зависимостей..."
npm install --silent
cd backend && npm install --silent && cd ..
cd frontend && npm install --silent && cd ..
echo "✅ Зависимости установлены"
echo ""

# Шаг 2: Создание .env файлов
echo "⚙️  Шаг 2/4: Создание конфигурации..."

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "✅ Создан backend/.env"
fi

if [ ! -f frontend/.env.local ]; then
    echo "VITE_API_URL=http://localhost:3001/api" > frontend/.env.local
    echo "✅ Создан frontend/.env.local"
fi
echo ""

# Шаг 3: Запуск базы данных
echo "🗄️  Шаг 3/4: Запуск базы данных..."
docker-compose up -d
echo "⏳ Ожидание запуска PostgreSQL (15 сек)..."
sleep 15
echo "✅ База данных запущена"
echo ""

# Шаг 4: Инициализация БД
echo "📊 Шаг 4/4: Инициализация базы данных..."
cd backend
npx prisma db push --skip-generate
npx prisma generate
cd ..
echo "✅ База данных готова"
echo ""

echo "======================================"
echo "✨ Установка завершена!"
echo ""
echo "🚀 Для запуска проекта выполни:"
echo "   npm run dev"
echo ""
echo "📝 Или читай SETUP.md для подробностей"
echo "======================================"

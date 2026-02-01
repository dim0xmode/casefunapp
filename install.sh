#!/bin/bash

echo "🎮 CaseFun - Первая установка"
echo "======================================"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен!"
    echo "📝 Установи Node.js с https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js: $(node --version)"

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    echo "📝 Установи Docker Desktop с https://www.docker.com/products/docker-desktop/"
    exit 1
fi

echo "✅ Docker: $(docker --version)"
echo ""

# Проверка что Docker запущен
if ! docker ps &> /dev/null; then
    echo "❌ Docker не запущен!"
    echo "📝 Пожалуйста, запусти Docker Desktop и повтори попытку"
    exit 1
fi

echo "✅ Docker запущен"
echo ""

# Установка зависимостей
echo "📦 Установка зависимостей..."
echo "⏳ Это может занять несколько минут..."
echo ""

echo "   [1/3] Корневые зависимости..."
npm install --silent

echo "   [2/3] Backend зависимости..."
cd backend && npm install --legacy-peer-deps --silent && cd ..

echo "   [3/3] Frontend зависимости..."
cd frontend && npm install --silent && cd ..

echo ""
echo "✅ Все зависимости установлены"
echo ""

# Создание .env файлов
echo "⚙️  Создание конфигурации..."

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "✅ Создан backend/.env"
fi

if [ ! -f frontend/.env.local ]; then
    echo "VITE_API_URL=http://localhost:3001/api" > frontend/.env.local
    echo "✅ Создан frontend/.env.local"
fi
echo ""

# Запуск базы данных
echo "🗄️  Запуск базы данных..."
docker-compose up -d

echo "⏳ Ожидание запуска PostgreSQL (15 сек)..."
sleep 15

echo "✅ База данных запущена"
echo ""

# Инициализация БД
echo "📊 Инициализация базы данных..."
cd backend
npx prisma db push
npx prisma generate
cd ..

echo ""
echo "======================================"
echo "✨ Установка завершена!"
echo ""
echo "🚀 Для запуска проекта выполни:"
echo "   ./start.sh"
echo ""
echo "Или просто:"
echo "   npm run dev"
echo ""
echo "======================================"

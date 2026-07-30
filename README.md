> **⚠️ Work in Progress**
>
> Arca is actively developed and may receive frequent updates, new features, and occasional breaking changes. If you use Arca for important financial data, make regular backups of your `/data` directory before updating.
>
> Arca is currently a web application with a responsive design for mobile and desktop. It can also be installed as a Progressive Web App (PWA).

# 💰 Arca

A modern, self-hosted personal finance dashboard designed to help you understand, track, and improve your financial life.

Arca gives you a clear overview of your income, expenses, budgets, subscriptions, and spending patterns — while keeping your financial data under your control.

## ✨ Features

- 📊 **Financial Dashboard**
  - Overview of income, expenses, savings, and monthly balance
  - Visual insights into spending habits

- 🏷️ **Smart Categorization**
  - Organize transactions into meaningful categories
  - Create rules to automatically categorize recurring payments

- 📅 **Monthly Budgeting**
  - Track your monthly financial goals
  - Compare planned expenses with actual spending

- 📱 **Responsive Web App**
  - Works on desktop and mobile devices
  - Installable as a Progressive Web App (PWA)

- 🔒 **Local-first Data**
  - Your financial data stays under your control
  - No required cloud services

## 📸 Screenshots

Coming soon.

## 🚀 Getting Started

### Docker

Run Arca:

    docker run -d \
      --name arca \
      -p 3000:3000 \
      -v arca-data:/data \
      --restart unless-stopped \
      damianeickhoff/arca:latest

Open Arca:

    http://localhost:3000

### Storage

Arca stores its database in:

    /data

Mount this directory to persist your data.

Example:

    /mnt/user/appdata/arca:/data

### Docker Compose

Example:

    services:
      arca:
        image: damianeickhoff/arca:latest
        container_name: arca
        ports:
          - "3000:3000"
        volumes:
          - arca-data:/data
        restart: unless-stopped

    volumes:
      arca-data:

## 🔄 Updates

Pull the latest image:

    docker pull damianeickhoff/arca:latest

Then recreate the container while keeping the `/data` volume.

Always back up your data before major updates.

## 🐳 Unraid

Arca can be installed through the Unraid Community Applications catalog.

The application data should be mapped to:

    /data

Recommended host path:

    /mnt/user/appdata/arca

## 🆘 Support

For issues and feature requests:

https://github.com/damianeickhoff/arca/issues

## 📄 License

This project is currently distributed as a self-hosted application.

# 💰 Arca

A modern personal finance dashboard designed to help you understand, track, and improve your financial life.

Arca gives you a clear overview of your income, expenses, budgets, and spending patterns — without the complexity of traditional budgeting tools.

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

- 🔒 **Local-first Data**
  - Your financial data stays under your control
  - No unnecessary cloud dependency

## 🚀 Getting Started

### Docker

Run Arca:

    docker run -d \
      --name arca \
      -p 3000:3000 \
      -v arca-data:/data \
      damianeickhoff/arca:latest

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

## 🐳 Unraid

Arca can be installed on Unraid using the Docker template.

The application data should be mapped to:

    /data

Recommended host path:

    /mnt/user/appdata/arca

## 🆘 Support

For issues and feature requests:

https://github.com/damianeickhoff/arca/issues

## 📄 License

This project is currently distributed as a self-hosted application.

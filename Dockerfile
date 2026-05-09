FROM node:18-slim

# Menentukan direktori kerja
WORKDIR /app

# Menyalin file konfigurasi package
COPY package*.json ./

# Menginstal dependensi
RUN npm install --production

# Menyalin seluruh kode sumber
COPY . .

# Mengekspos port aplikasi
EXPOSE 3030

# Menjalankan aplikasi
CMD ["node", "index.js"]

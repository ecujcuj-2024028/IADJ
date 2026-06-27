FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código del frontend
COPY . .

EXPOSE 5173

# Arrancar el servidor de desarrollo de Vite
CMD ["npm", "run", "dev"]

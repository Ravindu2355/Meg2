FROM node:20-bullseye

WORKDIR /app

# install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

# create downloads dir
RUN mkdir -p /app/downloads

EXPOSE 3000

CMD ["node", "index.js"]

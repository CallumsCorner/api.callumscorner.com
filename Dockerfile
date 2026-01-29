FROM node:18-alpine

WORKDIR /app

# install dependencies
COPY package.json ./
RUN npm install

# copy rest of the source
COPY . .

EXPOSE 3000

# Start the custom Express server
CMD ["npm", "start"]

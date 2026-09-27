-- Só desenvolvimento: o `prisma migrate dev` precisa criar um banco temporário (shadow database).
GRANT ALL PRIVILEGES ON *.* TO 'dcerutti'@'%';
FLUSH PRIVILEGES;

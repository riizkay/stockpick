cat > /etc/systemd/system/stockpick-api.service << EOL
[Unit]
Description=Stockpick API (Bun)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/stockpick/api
ExecStart=/bin/bash -c '/root/.bun/bin/bun run start'
Restart=always
RestartSec=3
User=root
Environment=NODE_ENV=production
Environment=PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

systemctl daemon-reload
systemctl enable stockpick-api.service
systemctl start stockpick-api.service
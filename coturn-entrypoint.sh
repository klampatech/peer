#!/bin/sh
# Coturn entrypoint script - substitutes environment variables in config

# Replace ${TURN_SECRET} placeholder with actual TURN_SECRET value
if [ -n "$TURN_SECRET" ]; then
    sed -i "s/\${TURN_SECRET}/$TURN_SECRET/g" /etc/coturn/turnserver.conf
fi

# Start coturn with whatever command was passed
exec "$@"
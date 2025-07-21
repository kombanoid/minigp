#!/usr/bin/env python3
import json

with open('private_data.json', 'r') as f:
    private_data = json.load(f)

with open('whitelist.json', 'r') as f:
    whitelist = json.load(f)
    allowed_riders = set(whitelist['allowed_riders'])

public_sessions = []
for session in private_data['sessions']:
    public_results = {rider: time for rider, time in session['results'].items() if rider in allowed_riders}
    if public_results:  # Only add if there are allowed riders
        public_session = session.copy()
        public_session['results'] = public_results
        public_sessions.append(public_session)

public_data = {'sessions': public_sessions}

with open('data.json', 'w') as f:
    json.dump(public_data, f, indent=4)

print("Public data.json generated.")
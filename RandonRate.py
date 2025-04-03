import time
import json
import boto3
import random
import string
import threading
import paho.mqtt.client as mqtt
from datetime import datetime


categories = [
    "fleet", "breaking", "home", "office", "weather", "factory", 
    "agriculture", "transport", "sports", "finance", "healthcare", "education"
]
subcategories = [
    "vehicle1", "news", "livingroom", "temperature", "alerts", "sensor", 
    "bedroom", "kitchen", "security", "stocks", "fitness", "classroom", "machinery"
]
third_list = [
    "location", "updates", "humidity", "motion", "status", "battery", 
    "speed", "forecast", "fire", "growth", "market", "exercise", "surveillance"
]
session = boto3.Session(
    aws_access_key_id="REDACTED",
    aws_secret_access_key="REDACTED",
    region_name="eu-north-1"
)

MQTT_BROKER = 'a32oq24wrmpa9s-ats.iot.eu-north-1.amazonaws.com'
MQTT_PORT = 8883 
CLIENT_ID = f"Client{random.choice(string.ascii_uppercase)}{random.randint(1, 9)}"
NUM_PACKETS = int(input('Enter number of packets '))
TIMEOUT = 4 
DISCONNECT_INTERVAL = 180  # (3 minutes)

topics = [f"{random.choice(categories)}/{random.choice(subcategories)}/{random.choice(third_list)}" for _ in range(NUM_PACKETS)]

dynamodb = session.resource("dynamodb")
table = dynamodb.Table('MQTT_Events')

success_count = 0
failure_count = 0
disconnect_count = 0
subscribed_topics = set()

def generate_payload(eventType, message="",topic="unknown"):
    return json.dumps({
        "clientId": CLIENT_ID, 
        "timestamp": int(time.time()), 
        "eventType": eventType, 
        "message": message,
        "topic": topic
    })

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        time.sleep(2)
        client.publish('connection/logs',generate_payload("CONNECT",f"{CLIENT_ID}/Connected", 'connection/logs'))
        print(CLIENT_ID," Connected successfully")
    else:
        print(f"Connection failed with result code {rc}")
        
def on_message(client, userdata, msg):
    global topics
    decoded_msg = msg.payload.decode()
    actual_message = ""
    # topics.append(msg.topic)
    try:
        data = json.loads(decoded_msg)
        actual_message = data.get("message", decoded_msg)
    except json.JSONDecodeError:
        actual_message = decoded_msg 

    if msg.topic in topics and actual_message.strip():
        print("Receiving...")
        publish_log(msg.topic, "RECEIVE", actual_message)
        time.sleep(2)

def on_disconnect(client, userdata, rc):
    global disconnect_count
    try:
        if rc is None or rc == 0:
            payload = generate_payload("DISCONNECT", f"{CLIENT_ID}/Disconnected", 'diconnection/logs')
            # client.publish("diconnection/logs", payload) 
            # publish_log("diconnection/logs", "DISCONNECT", f"{CLIENT_ID}/Disconnected")
            store_event(payload)
            time.sleep(2)
            disconnect_count += 1
            print(f"{CLIENT_ID} Disconnected (rc={rc})")
        else:
            print(f"Disconnect failed with result code {rc}")
    except:
        store_event(payload)

def publish_log(topic, eventType, message=""):
    payload = generate_payload(eventType, message, topic)
    client.publish(topic, payload)
    time.sleep(2)

def track_packet_success(status):
    global success_count, failure_count
    if status:
        success_count += 1
    else:
        failure_count += 1

def manage_subscription(client):
    global subscribed_topics
    choice = random.randint(1, 2)
    topic = random.choice(topics)
    match choice:
        case 1:
            try:
                print("Subscribing...")
                SubName = f"Subscribe{random.choice(string.ascii_uppercase)}{random.randint(1, 9)}"
                client.subscribe(topic)
                subscribed_topics.add(topic)  # Add to the set
                publish_log(topic, "SUBSCRIBE", f"{SubName} subscribed") # Corrected log message
                time.sleep(1)
                track_packet_success(True)
            except Exception as e:
                print("Sub:", e)
                track_packet_success(False)

        case 2:
            try:
                print("Unsubscribing...")
                USubName = f"Unsubscribe{random.choice(string.ascii_uppercase)}{random.randint(1, 9)}" # Changed variable name
                client.unsubscribe(topic)
                publish_log(topic, "UNSUBSCRIBE", f"{USubName} unsubscribed")
                time.sleep(1)
                track_packet_success(True)
            except Exception as e:
                print("UnSub:", e)
                track_packet_success(False)

def manage_publishing(client):
    global success_count, failure_count
    try:
        print("Publishing...")
        message = ''.join(random.choices(string.ascii_lowercase, k=5))
        topic = random.choice(topics)
        payload = json.dumps({"message": message}) # Ensure message is sent as JSON
        client.publish(topic, payload)
        publish_log(topic, "PUBLISH", message)
        track_packet_success(True)
        time.sleep(1)
    except Exception as e:
        print("Publishing error:", e)
        track_packet_success(False)

def periodic_disconnect(client):
    # try:
    while True:
        time.sleep(DISCONNECT_INTERVAL)
        # client.on_disconnect = on_disconnect
        client.disconnect()
        time.sleep(TIMEOUT)
        client.reconnect()
        # disconnect_count += 1
        print(f"Reconnected after {DISCONNECT_INTERVAL} seconds.")
    # except:
    #     payload = generate_payload("DISCONNECT", f"{CLIENT_ID}/Disconnected", 'diconnection/logs')
    #     store_event(payload)

def fetch_connection_counts():
    try:
        response = table.query(
            KeyConditionExpression="clientId = :cid",
            ExpressionAttributeValues={":cid": CLIENT_ID}
        )
        connect_count = sum(1 for item in response.get('Items', []) if item['eventType'] == "CONNECT")
        disconnect_count = sum(1 for item in response.get('Items', []) if item['eventType'] == "DISCONNECT")
        
        latest_event = max(response['Items'], key=lambda x: x['timestamp'])
        current_status = latest_event['eventType']
        
        return {
            "clientId": CLIENT_ID,"connect_count": connect_count,"disconnect_count": disconnect_count,
            "latest_event":latest_event,'current_status':current_status
        }
    except Exception as e:
            print(f"[Error] Failed to fetch connection counts: {e}")
            return {"clientId": CLIENT_ID, "connect_count": 0, "disconnect_count": 0}

def store_event(payload):
    data = json.loads(payload)
    table.put_item(Item=data)


client = mqtt.Client()
client.tls_set("AmazonRootCA1.pem", 
            certfile="b8aa6d72d0d0ceda99fd98e3582432d7431e7e7785f75d9dd139df2cd40d41e0-certificate.pem.crt", 
            keyfile="b8aa6d72d0d0ceda99fd98e3582432d7431e7e7785f75d9dd139df2cd40d41e0-private.pem.key")

client.on_connect = on_connect
client.on_message = on_message
client.on_disconnect = on_disconnect

print('entry')
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_start()



time.sleep(4)
try:
    threading.Thread(target=periodic_disconnect, args=(client,), daemon=True).start()
    for i in range(NUM_PACKETS):
            print(i,end=',')
            random.choice([manage_subscription, manage_publishing])(client)
            time.sleep(1)
except:
    payload = generate_payload("DISCONNECT", f"{CLIENT_ID}/Disconnected", 'diconnection/logs')
    store_event(payload)


time.sleep(1)
client.loop_stop()
client.disconnect()

# Log final status
print(f"\nTotal Success Count: {success_count}")
print(f"Total Failure Count: {failure_count}")
print(f"Total Disconnections: {disconnect_count}")
print(fetch_connection_counts())

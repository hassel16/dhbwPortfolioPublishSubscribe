/*
 * Copyright © 2018 Dennis Schulmeister-Zimolong
 * 
 * E-Mail: dhbw@windows3.de
 * Webseite: https://www.wpvs.de/
 * 
 * Dieser Quellcode ist lizenziert unter einer
 * Creative Commons Namensnennung 4.0 International Lizenz.
 */
package dhbwka.wwi.vertsys.pubsub.fahrzeug;

import com.sun.javaws.exceptions.InvalidArgumentException;
import jdk.net.SocketFlow;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

/**
 * Hauptklasse unseres kleinen Progrämmchens.
 *
 * Mit etwas Google-Maps-Erfahrung lassen sich relativ einfach eigene
 * Wegstrecken definieren. Man muss nur Rechtsklick auf einen Punkt machen und
 * "Was ist hier?" anklicken, um die Koordinaten zu sehen. Allerdings speichert
 * Goolge Maps eine Nachkommastelle mehr, als das ITN-Format erlaubt. :-)
 */
public class Main {

    public static void main(String[] args) throws Exception {
        int qos             = 0;
        String clientId     = "vehicleProducer"+ (Math.random() * Math.random());
        MemoryPersistence persistence = new MemoryPersistence();


        // Fahrzeug-ID abfragen
        String vehicleId = Utils.askInput("Beliebige Fahrzeug-ID", "postauto");

        // Zu fahrende Strecke abfragen
        File workdir = new File("./waypoints");
        String[] waypointFiles = workdir.list((File dir, String name) -> {
            return name.toLowerCase().endsWith(".itn");
        });

        System.out.println();
        System.out.println("Aktuelles Verzeichnis: " + workdir.getCanonicalPath());
        System.out.println();
        System.out.println("Verfügbare Wegstrecken");
        System.out.println();

        for (int i = 0; i < waypointFiles.length; i++) {
            System.out.println("  [" + i + "] " + waypointFiles[i]);
        }

        System.out.println();
        int index = Integer.parseInt(Utils.askInput("Zu fahrende Strecke", "0"));

        List<WGS84> waypoints;
        try {
            waypoints = parseItnFile(new File(workdir, waypointFiles[index]));


        // Adresse des MQTT-Brokers abfragen
        String mqttAddress = Utils.askInput("MQTT-Broker", Utils.MQTT_BROKER_ADDRESS);


        // DONE: Sicherstellen, dass bei einem Verbindungsabbruch eine sog.
        // LastWill-Nachricht gesendet wird, die auf den Verbindungsabbruch
        // hinweist. Die Nachricht soll eine "StatusMessage" sein, bei der das
        // Feld "type" auf "StatusType.CONNECTION_LOST" gesetzt ist.
        //
        // Die Nachricht muss dem MqttConnectOptions-Objekt übergeben werden
        // und soll an das Topic Utils.MQTT_TOPIC_NAME gesendet werden.
            MqttClient sampleClient = new MqttClient(mqttAddress,clientId,persistence);

            StatusMessage lastWillMessage= new StatusMessage();
            lastWillMessage.type=StatusType.CONNECTION_LOST;
            lastWillMessage.vehicleId=vehicleId;
            lastWillMessage.message="Mein letzter Wille";

            MqttConnectOptions connOpts = new MqttConnectOptions();
            connOpts.setCleanSession(true);
            connOpts.setWill(Utils.MQTT_TOPIC_NAME, lastWillMessage.toJson(), qos, true);
            System.out.println("Connecting to broker: "+mqttAddress);

        // DONE: Verbindung zum MQTT-Broker herstellen.
            sampleClient.connect(connOpts);
            System.out.println("Connected");
        // DONE: Statusmeldung mit "type" = "StatusType.VEHICLE_READY" senden.
        // Die Nachricht soll soll an das Topic Utils.MQTT_TOPIC_NAME gesendet
        // werden.
            StatusMessage initStatus= new StatusMessage();
            initStatus.type=StatusType.VEHICLE_READY;
            initStatus.vehicleId=vehicleId;
            initStatus.message="Fahrzeug anmelden";

            MqttMessage initMessage = new MqttMessage();
            initMessage.setQos(0);
            initMessage.setPayload(initStatus.toJson());
            sampleClient.publish(Utils.MQTT_TOPIC_NAME, initMessage);
            System.out.println("Init message was published");
        // DONE: Thread starten, der jede Sekunde die aktuellen Sensorwerte
        // des Fahrzeugs ermittelt und verschickt. Die Sensordaten sollen
        // an das Topic Utils.MQTT_TOPIC_NAME + "/" + vehicleId gesendet werden.
        Vehicle vehicle = new Vehicle(vehicleId, waypoints);
        vehicle.startVehicle();
            java.util.Timer timer= new java.util.Timer();
            System.out.println("Start publishing vehicle data");
            timer.schedule(new java.util.TimerTask() {

                @Override
                public void run() {
                    try {
                        sampleClient.publish(Utils.MQTT_TOPIC_NAME + "/" + vehicleId, new MqttMessage(vehicle.getSensorData().toJson()));
                    }catch (Exception e){
                        e.printStackTrace();
                    }
                    }
            }, 0,1000);


        // Warten, bis das Programm beendet werden soll
        Utils.fromKeyboard.readLine();

        vehicle.stopVehicle();
        timer.cancel();
        System.out.println("Vehicle data was published");
        //schon weiter oben gestoppt
        // DONE: Oben vorbereitete LastWill-Nachricht hier manuell versenden,
        // da sie bei einem regulären Verbindungsende nicht automatisch
        // verschickt wird.
        //
        // Anschließend die Verbindung trennen und den oben gestarteten Thread
        // beenden, falls es kein Daemon-Thread ist.
            sampleClient.publish(Utils.MQTT_TOPIC_NAME, new MqttMessage(lastWillMessage.toJson()));
            sampleClient.disconnect();
            System.out.println("Disconnected");
            System.exit(0);

        }catch(IOException ioE){
            ioE.printStackTrace();
        }catch(MqttException me){
            System.out.println("reason "+me.getReasonCode());
            System.out.println("msg "+me.getMessage());
            System.out.println("loc "+me.getLocalizedMessage());
            System.out.println("cause "+me.getCause());
            System.out.println("excep "+me);
            me.printStackTrace();
        }catch(Exception e){
            e.printStackTrace();
        }
    }

    /**
     * Öffnet die in "filename" übergebene ITN-Datei und extrahiert daraus die
     * Koordinaten für die Wegstrecke des Fahrzeugs. Das Dateiformat ist ganz
     * simpel:
     *
     * <pre>
     * 0845453|4902352|Point 1 |0|
     * 0848501|4900249|Point 2 |0|
     * 0849295|4899460|Point 3 |0|
     * 0849796|4897723|Point 4 |0|
     * </pre>
     *
     * Jede Zeile enthält einen Wegpunkt. Die Datenfelder einer Zeile werden
     * durch | getrennt. Das erste Feld ist die "Longitude", das zweite Feld die
     * "Latitude". Die Zahlen müssen durch 100_000.0 geteilt werden.
     *
     * @param file ITN-Datei
     * @return Liste mit Koordinaten
     * @throws java.io.IOException
     */
    public static List<WGS84> parseItnFile(File file) throws IOException {
        List<WGS84> waypoints = new ArrayList<>();
        String[] values = {"empty"};
        int i = 0;
        try {
            Scanner input = new Scanner(file);
            while (input.hasNext()) {
                //or to process line by line
                String nextLine = input.nextLine();
                values = nextLine.split("\\|");
                if(values.length<2)
                    System.out.println("Die Zeile hat das falsche Format: "+nextLine);
                waypoints.add(new WGS84(Double.parseDouble(values[1])/100000,Double.parseDouble(values[0])/100000));
            }
        } catch (NumberFormatException nfE) {
            System.out.println("Die Variable ist kein Double: " + values[i]);
            nfE.printStackTrace();
        }
            return waypoints;
    }
}

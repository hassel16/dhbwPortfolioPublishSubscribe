alert("Die Refernzdokumentation für Paho-JavaScript gibt es hier:\n\nhttp://www.eclipse.org/paho/files/jsdoc/Paho.MQTT.Client.html");

/**
 * Hauptklasse für unser schönes, kleines Dashboard. :-)
 */
class VehicleDashboard {
    /**
     * Konstruktor. Hier werden ein paar Werte vorbelegt.
     */
    constructor() {
        this.initialAddress = "ws://localhost:8080/mqtt";
        this.topics = "VehicleTracking";

        this.addressInput = null;
        this.connectButton = null;
        this.disconnectButton = null;

        this.mqttClient = null;

        this.vehicleList = null;
        this.vehicleTemplate = "";
    }

    /**
     * Initialisierungen, nachdem die Seite geladen wurde
     */
    onWindowLoad() {
        // Form-Elemente mit den Verbindungsdaten auslesen
        this.addressInput = document.getElementById("mqtt-address");
        this.connectButton = document.getElementById("btn-connect");
        this.disconnectButton = document.getElementById("btn-disconnect");

        // Formularfelder vorbelegen
        this.addressInput.value = this.initialAddress;
        this.onDisconnect();

        // Vectoren sind, was OpenLayers Marker auf der Karte nennt
        this.mapMarkerLayer = new ol.layer.Vector({
            source: new ol.source.Vector({})
        });

        // Karte initialisieren
        this.centerPoint = ol.proj.transform([8.385901, 49.026489], "EPSG:4326", "EPSG:3857");

        this.map = new ol.Map({
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.OSM()
                }),
                this.mapMarkerLayer
            ],
            target: 'map',
            view: new ol.View({
                center: this.centerPoint,
                zoom: 10
            })
        });

        // HTML-Template für Fahrzeugdaten
        this.vehicleList = document.getElementById("vehicle-list");
        this.vehicleTemplate = document.getElementById("vehicle-template").innerHTML;
    }

    /**
     * Verbindung herstellen.
     */
    connect() {
        let clientId = "VTD-" + new Date().getTime();
        this.mqttClient = new Paho.MQTT.Client(this.addressInput.value, clientId);

        this.mqttClient.onConnected = () => this.onConnect();
        this.mqttClient.onConnectionLost = responseObject => this.onDisconnect(responseObject);
        this.mqttClient.onMessageArrived = message => this.onMessageArrived(message);

        let connectOptions = {
                onSuccess: () => this.onConnect(),
            onFailure: (ctx, code, message) => this.onDisconnect({
            errorCode: code,
            errorMessage: message
        })
    };
        this.mqttClient.connect(connectOptions);

        // TODO: Verbindung herstellen
    }

    /**
     * Verbindung trennen.
     */
    disconnect() {
        this.mqttClient.disconnect()
        // TODO: Verbindung trennen
    }

    /**
     * Der Verbindung steht. Alle Mann auf Gefechtstation!
     */
    onConnect() {
        this.addressInput.disabled = true;
        this.connectButton.classList.add("hidden");
        this.disconnectButton.classList.remove("hidden");

        this.mqttClient.subscribe(this.topics + "/#");
    }

    /**
     * Die Verbindung wurde getrennt. Rühren, Soldat!
     *
     * @param {Object] responseObject Objekt mit eventueller Fehlermeldung
                 */
    onDisconnect(responseObject) {
        if (responseObject && responseObject.errorCode !== 0) {
            console.log("Verbindung verloren: " + responseObject.errorMessage);
            alert(responseObject.errorMessage);
        }

        this.addressInput.disabled = false;
        this.connectButton.classList.remove("hidden");
        this.disconnectButton.classList.add("hidden");
    }

    /**
     * Eine Nachricht wurde empfangen. Daten in den Schaubildern
     * daher aktualisieren, um ihre Inhalte sichtbar zu machen.
     *
     * @param {Object} mqttMessage Empfangene Nachricht
     */
    onMessageArrived(mqttMessage) {
        let message = JSON.parse(mqttMessage.payloadString);
        if(message.VEHICLE_READY == undefined && message.CONNECTION_LIST == undefined){
            this.updateVehicle(message);
        }else if(message.VEHICLE_READY == undefined && message.SENSOR_DATA == undefined){
            this.removeVehicle(message);
        }else if(message.CONNECTION_LIST == undefined && message.SENSOR_DATA == undefined){
            this.addVehicle(message);
        }

        // TODO: Anzeige aktualisieren
        //
        // Hierfür muss der im JSON mitgesendete Nachrichtentyp
        // ausgewertet werden.
        //
        // VEHICLE_READY: this.addVehicle(message) aufrufen
        // CONNECTION_LIST: this.removeVehicle(message) aufrufen
        // SENSOR_DATA: this.updateVehicle(message) aufrufen
    }

    /**
     * Neues Fahrzeug der Anzeige hinzufügen.
     * @param {Object} message Empfangen Nachricht (deserialisiert)
     */
    addVehicle(message) {
        // Eintrag in der Fahrzeugliste hinzufügen
        let html = this.vehicleTemplate.replace(/___ID___/g, message.vehicleId);
        this.vehicleList.innerHTML += html;

        // Marker auf der Karte platzieren
        let marker = new ol.Feature({
            geometry: new ol.geom.Point(this.centerPoint)
        });

        marker.setStyle(new ol.style.Style({
            image: new ol.style.Icon({
                anchor: [0.5, 1.2],
                anchorXUnits: "fraction",
                anchorYUnits: "fraction",
                opacity: 1,
                scale: 2,
                src: "marker.svg"
            }),
            text: new ol.style.Text({
                text: message.vehicleId,
                font: 'bold 28px "Open Sans", "Arial Unicode MS", "sans-serif"',
                fill: new ol.style.Fill({
                    color: "black"
                }),
                stroke: new ol.style.Stroke({
                    color: 'white', width: 2
                })
            })
        }));

        marker.setId(message.vehicleId);
        this.mapMarkerLayer.getSource().addFeature(marker);
    }

    /**
     * Fahrzeug aus der Anzeige entfernen.
     * @param {Object} message Empfangen Nachricht (deserialisiert)
     */
    removeVehicle(message) {
        // Eintrag in der Fahrzeugliste entfernen
        let vehicleDiv = document.getElementById("vehicle-" + message.vehicleId);

        if (vehicleDiv) {
            vehicleDiv.parentNode.removeChild(vehicleDiv);
        }

        // Marker entfernen
        let marker = this.mapMarkerLayer.getSource().getFeatureById(message.vehicleId);

        if (marker) {
            this.mapMarkerLayer.getSource().removeFeature(marker);
        }
    }

    /**
     * Position und Statuswerte eines Fahrzeugs aktualisieren.
     * @param {Object} message Empfangen Nachricht (deserialisiert)
     */
    updateVehicle(message) {
        // Sicherstellen, dass das Fahrzeug angezeigt wird
        let vehicleDiv = document.getElementById("vehicle-" + message.vehicleId);

        if (!vehicleDiv) {
            this.addVehicle(message);
            vehicleDiv = document.getElementById("vehicle-" + message.vehicleId);
        }

        // Eintrag in der Fahrzeugliste aktualisieren
        let idSpan = vehicleDiv.querySelector(".value-id");
        let latitudeSpan = vehicleDiv.querySelector(".value-latitude");
        let longitudeSpan = vehicleDiv.querySelector(".value-longitude");
        let statusSpan = vehicleDiv.querySelector(".value-status");
        let gearSpan = vehicleDiv.querySelector(".value-gear");
        let rpmSpan = vehicleDiv.querySelector(".value-rpm");
        let kmhSpan = vehicleDiv.querySelector(".value-kmh");

        idSpan.textContent = message.vehicleId;
        latitudeSpan.textContent = parseFloat(message.latitude).toFixed(5);
        longitudeSpan.textContent = parseFloat(message.longitude).toFixed(5);
        statusSpan.textContent = message.running ? "Fährt" : "Steht";
        gearSpan.textContent = message.gear;
        rpmSpan.textContent = parseFloat(message.rpm).toFixed(2);
        kmhSpan.textContent = parseFloat(message.kmh).toFixed(2);

        // Fahrzeug auf der Karte zeigen
        let marker = this.mapMarkerLayer.getSource().getFeatureById(message.vehicleId);

        if (marker) {
            let point = new ol.geom.Point(ol.proj.transform([message.longitude, message.latitude], "EPSG:4326", "EPSG:3857"));
            marker.setGeometry(point);
        }
    }

    /**
     * Bei Klick auf ein Fahrzeug das Fahrzeug auf der Karte zentrieren.
     * @param {DomEvent} event Click Event
     */
    onVehicleClicked(event) {
        event.preventDefault();

        let link = event.target;

        while (link.tagName !== "A") {
            link = link.parentNode;
        }

        let vehicleId = link.dataset.vehicle;

        let marker = this.mapMarkerLayer.getSource().getFeatureById(vehicleId);

        if (!marker) {
            return;
        }

        let coordinates = marker.getGeometry().getCoordinates();
        let size = this.map.getSize();
        let position = [size[0] / 2, size[1] / 2];

        this.map.getView().centerOn(coordinates, size, position);
    }
}

let dashboard = new VehicleDashboard();
window.addEventListener("load", () => dashboard.onWindowLoad());
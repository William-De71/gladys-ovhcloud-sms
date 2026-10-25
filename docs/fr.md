# OVHcloud SMS

## Présentation

Cette intégration envoie les notifications de Gladys par SMS grâce à
l'[API SMS d'OVHcloud](https://www.ovhcloud.com/fr/sms/), vers n'importe quel
numéro de mobile et n'importe quel opérateur. Chaque utilisateur de Gladys
saisit son propre numéro ; l'administrateur saisit une seule fois les clés de
l'API OVHcloud pour la maison.

Elle apporte aussi :

- trois **déclencheurs de scène** : SMS non envoyé, SMS reçu, crédits bas ;
- deux **actions de scène** : envoyer un SMS à n'importe quel numéro (même à
  quelqu'un qui n'est pas utilisateur de Gladys), lire le compte SMS ;
- deux **widgets de tableau de bord** : le compte SMS et les SMS reçus.

![Les deux widgets de l'intégration : le compte SMS avec ses crédits, et les derniers SMS reçus (illustration générée, pas une capture d'écran)](https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-sms/main/docs/assets/widgets.fr.png)

Transport : **cloud**. Les textes et les numéros de téléphone passent par
l'API OVHcloud (`eu.api.ovh.com` ou `ca.api.ovh.com`), puis par les
opérateurs mobiles.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Un compte OVHcloud avec un **compte SMS** (un pack SMS, commandé dans
  l'espace client, rubrique Télécom → SMS) et des crédits. Chaque SMS consomme
  des crédits, davantage pour un long texte ou un numéro étranger.
- Facultatif : un **expéditeur** créé et validé dans l'espace client (un nom
  comme `GLADYS`, ou un numéro virtuel). Sans lui, les SMS partent d'un numéro
  court auquel les destinataires peuvent répondre.
- Facultatif, pour recevoir des SMS : un **numéro virtuel**, ou les réponses
  au numéro court.

## Configuration

1. Dans Gladys, ouvrez **Intégrations → OVHcloud SMS → Configuration**.
2. Choisissez la **région de l'API** de votre compte OVHcloud (Europe ou
   Canada).
3. Cliquez sur **Créer les clés** de votre région. Connectez-vous à
   OVHcloud : les droits dont l'intégration a besoin sont déjà remplis
   (`GET /sms`, `GET /sms/*`, `POST /sms/*/jobs`). Donnez un nom et une
   description à l'application, choisissez la validité **Unlimited**, puis
   créez les clés.
4. Recopiez la **clé d'application**, le **secret d'application** et la
   **clé consommateur** dans la configuration, puis enregistrez.
5. Cliquez sur **Tester la connexion** : le compte SMS, ses crédits, ses
   expéditeurs et celui utilisé s'affichent. **Envoyer un SMS de test**
   vérifie toute la chaîne.
6. Chaque utilisateur ouvre le bloc **Mon compte** du même écran et saisit
   son **numéro de mobile**.

| Champ                        | Usage                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Région de l'API              | Europe (ovh.com, ovhcloud.com) ou Canada (ovh.ca)                                      |
| Clé d'application            | Sur la page de création des clés                                                       |
| Secret d'application         | Sur la page de création des clés, stocké chiffré                                       |
| Clé consommateur             | Sur la page de création des clés, stockée chiffrée                                     |
| Compte SMS                   | Facultatif : `sms-xx12345-1`, seulement si le compte OVHcloud en a plusieurs           |
| Expéditeur                   | Facultatif : un expéditeur actif ; vide = le premier actif, ou le numéro court         |
| Indicatif du pays par défaut | Ajouté aux numéros saisis sans indicatif (`33` par défaut : 06… devient +336…)         |
| Alerte de crédits bas        | Sous ce nombre de crédits, « Crédits bas » se déclenche une fois (20 par défaut)       |
| Lire les SMS reçus           | Lit les SMS reçus toutes les 30 secondes, pour « SMS reçu » et le widget des SMS reçus |

L'intégration n'ajoute jamais la mention « STOP » qu'OVHcloud ajoute aux SMS
publicitaires : les notifications d'une maison ne sont pas de la publicité.

## Utilisation

### Notifications

Toute notification Gladys adressée à un utilisateur qui a saisi un numéro part
par SMS : alarmes, actions de scène « Envoyer un message », réponses de Gladys.
Une image jointe à un message est ignorée (un SMS ne transporte que du texte).

### Déclencheurs de scène

| Déclencheur    | Quand il se déclenche                                                                                         | Variables                               |
| -------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| SMS non envoyé | Au premier échec d'une notification, puis seulement après qu'un SMS est de nouveau passé (jamais de boucle)   | cause, code HTTP, erreur, numéro masqué |
| SMS reçu       | À chaque nouveau SMS du compte, filtré par expéditeur et premier mot (« Lire les SMS reçus » doit être actif) | expéditeur, texte, premier mot, date    |
| Crédits bas    | Les crédits sont passés sous le seuil ; de nouveau seulement après une recharge au-dessus                     | crédits restants, seuil, compte SMS     |

**Ne vous servez jamais de « SMS reçu » pour ouvrir une porte ou désarmer une
alarme** : n'importe qui peut envoyer un SMS avec un numéro falsifié.

### Actions de scène

- **Envoyer un SMS à un numéro** : un ou plusieurs numéros séparés par des
  virgules, et un texte (variables de scène acceptées). Renvoie les SMS
  envoyés, les numéros refusés, les crédits utilisés et restants.
- **Lire le compte SMS** : renvoie les crédits restants, les SMS envoyés et
  reçus ce mois-ci, le compte SMS.

### Exemples de scènes

- _Quand l'alarme se déclenche_ → envoyer un SMS au voisin : « Alarme à la
  maison, peux-tu jeter un œil ? ».
- _Quand les crédits sont bas_ → envoyer un message à l'administrateur :
  « Plus que {{triggerEvent.data.credits_left}} crédits SMS ».
- _Quand un SMS commençant par STATUT est reçu de mon numéro_ → lire les
  températures et répondre avec « Envoyer un SMS à un numéro » vers
  `{{triggerEvent.data.sender}}`.

### Widgets de tableau de bord

- **SMS OVHcloud** : crédits restants (orange près du seuil, rouge en
  dessous), état de l'API, SMS envoyés et reçus ce mois-ci, expéditeur, seuil
  et dernier échec.
- **SMS reçus** : les derniers SMS reçus ; touchez-en un pour le lire en
  entier.

## Dépannage

- **« OVHcloud refuse les clés »** : vérifiez la région, la clé et le secret
  d'application, et que la clé consommateur a été validée (la page de
  création doit se terminer sur un succès) et n'a pas expiré ni été révoquée.
- **« La clé consommateur manque de droits »** : créez une nouvelle clé avec
  le lien de la configuration, qui remplit les trois droits.
- **« Aucun compte SMS utilisable »** : commandez un pack SMS, ou saisissez le
  nom de service si votre compte OVHcloud a plusieurs comptes SMS (listés par
  « Tester la connexion »).
- **« Expéditeur refusé »** : l'expéditeur de la configuration n'est pas
  encore actif (en attente de validation) : videz le champ pour utiliser le
  choix automatique.
- **Aucun SMS reçu** : la réception demande un numéro virtuel, ou des réponses
  au numéro court ; vérifiez que « Lire les SMS reçus » est activé.
- **Journaux** : Intégrations → OVHcloud SMS → onglet Supervision. Les
  numéros sont masqués ; les clés n'apparaissent jamais.

import { useTranslation } from "react-i18next";
import { SEO } from "@/components/SEO";

function PrivacyEs() {
  return (
    <>
      <SEO
        title="Política de Privacidad | Tapee Tickets"
        description="Política de tratamiento de datos personales de Tapee. Conoce cómo protegemos tu información personal."
        url="https://tapeetickets.com/privacidad"
      />
      <h1 className="text-3xl font-bold mb-2">Política de Tratamiento de Datos Personales</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Política Integral de Tratamiento de Datos Personales — Habeas Data — TAPEE
      </p>
      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">I. Marco Normativo y Principios Rectores</h2>
          <p className="text-muted-foreground leading-relaxed">
            La presente Política de Tratamiento de Datos Personales se fundamenta en la Constitución Política de Colombia (Art. 15), la Ley 1581 de 2012, el Decreto 1377 de 2013 y la Sentencia C-748 de 2011. TAPEE se compromete a aplicar de manera rigurosa los principios de legalidad, finalidad, libertad, veracidad, transparencia, acceso y circulación restringida, seguridad y confidencialidad en el manejo de la información.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">II. Identificación y Domicilio del Responsable</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Titular:</span> TAPEE S.A.S. (en adelante, "TAPEE" o el "Responsable").</li>
            <li><span className="font-medium text-foreground">Identificación Tributaria:</span> 902064713-1</li>
            <li><span className="font-medium text-foreground">Domicilio Legal:</span> Medellín, Antioquia, Colombia.</li>
            <li><span className="font-medium text-foreground">Canales de Atención:</span> Correo electrónico <a href="mailto:hola@tapee.app" className="text-primary hover:underline">hola@tapee.app</a> para la recepción de consultas, peticiones, quejas y reclamos (PQR) relacionados con el tratamiento de datos.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">III. Definiciones Técnicas Legales</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Autorización:</span> Consentimiento previo, expreso e informado del Titular.</li>
            <li><span className="font-medium text-foreground">Base de Datos:</span> Conjunto organizado de datos personales objeto de Tratamiento.</li>
            <li><span className="font-medium text-foreground">Encargado del Tratamiento:</span> Persona que realiza el tratamiento por cuenta del Responsable.</li>
            <li><span className="font-medium text-foreground">Dato Sensible:</span> Aquellos que afectan la intimidad del Titular o cuyo uso indebido puede generar discriminación (ej. biometría en eventos).</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">IV. Categorías de Datos y Métodos de Recolección</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE recolectará datos a través de sus interfaces digitales, formularios de registro, dispositivos de lectura NFC y comunicaciones directas. Las categorías incluyen:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Datos de Identificación Personal:</span> Nombres, apellidos, número de identificación, género, edad y fotografía de perfil (opcional).</li>
            <li><span className="font-medium text-foreground">Datos de Contacto:</span> Direcciones de correo electrónico, números de telefonía móvil, perfiles de redes sociales y direcciones de facturación.</li>
            <li><span className="font-medium text-foreground">Datos de Tráfico y Navegación:</span> Direcciones IP, identificadores de sesión, tipos de navegador, sistemas operativos, registros de "logs", geolocalización basada en nodos de red y patrones de comportamiento dentro de la aplicación.</li>
            <li><span className="font-medium text-foreground">Datos Técnicos de Proximidad (NFC):</span> Identificadores de dispositivos vinculados (UID de chips), marcas de tiempo de ingreso y salida, histórico de validaciones en puntos de control y consumos asociados si la manilla cuenta con sistema cashless.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">V. Finalidades del Tratamiento (Usos Autorizados)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            El Titular, al aceptar esta política, autoriza de manera expresa a TAPEE para tratar sus datos con los siguientes fines:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Operación del Servicio:</span> Gestión de preventas, ventas, reservas, emisión de tickets digitales y entrega física de dispositivos NFC.</li>
            <li><span className="font-medium text-foreground">Seguridad y Prevención de Riesgos:</span> Verificación de identidad para mitigar fraudes en transacciones electrónicas y prevenir la suplantación de identidad en el ingreso a eventos.</li>
            <li><span className="font-medium text-foreground">Soporte Técnico y PQR:</span> Atender consultas técnicas sobre el funcionamiento de la plataforma o la integridad de los dispositivos NFC.</li>
            <li><span className="font-medium text-foreground">Relación con el Organizador:</span> Transferir los datos de asistencia al Organizador del Evento para fines de pólizas de seguros de asistentes, control de aforo y logística de emergencia.</li>
            <li><span className="font-medium text-foreground">Marketing y Fidelización:</span> Envío de información publicitaria, boletines, ofertas comerciales y encuestas de satisfacción. El Titular podrá revocar esta finalidad en cualquier momento.</li>
            <li><span className="font-medium text-foreground">Analítica Masiva:</span> Realizar estudios estadísticos sobre tendencias de asistencia, horas pico de ingreso y mapas de calor en eventos para mejorar la seguridad pública.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VI. Derechos de los Titulares (Art. 8 Ley 1581)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Conocimiento:</span> Acceder de forma gratuita a los datos personales que hayan sido objeto de Tratamiento.</li>
            <li><span className="font-medium text-foreground">Actualización y Rectificación:</span> Solicitar la corrección de datos parciales, inexactos, incompletos o que induzcan a error.</li>
            <li><span className="font-medium text-foreground">Prueba de Autorización:</span> Solicitar prueba de la autorización otorgada al Responsable del Tratamiento.</li>
            <li><span className="font-medium text-foreground">Revocatoria y Supresión:</span> Solicitar la supresión del dato o revocar la autorización cuando no se respeten los principios legales, previa queja ante la Superintendencia de Industria y Comercio (SIC).</li>
            <li><span className="font-medium text-foreground">Información:</span> Ser informado sobre el uso que se le ha dado a sus datos personales.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VII. Protocolos de Seguridad y Confidencialidad</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE declara que cuenta con medidas de seguridad física, técnica y administrativa para evitar el acceso no autorizado. Esto incluye:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Protocolos de cifrado de extremo a extremo en la transmisión de datos.</li>
            <li>Servidores con redundancia y almacenamiento en la nube bajo estándares internacionales (SOC 2 / ISO 27001).</li>
            <li>Acceso restringido a la base de datos solo a personal autorizado bajo acuerdos de confidencialidad estricta.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VIII. Vigencia y Modificaciones</h2>
          <p className="text-muted-foreground leading-relaxed">
            La presente política entra en vigor el día de su publicación. TAPEE se reserva el derecho de modificarla en cualquier momento para adaptarla a cambios legislativos o tecnológicos. Cualquier cambio sustancial será notificado a través de los canales de contacto registrados.
          </p>
        </section>
      </div>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <SEO
        title="Privacy Policy | Tapee Tickets"
        description="Tapee's personal data processing policy. Learn how we protect your personal information."
        url="https://tapeetickets.com/privacidad"
      />
      <h1 className="text-3xl font-bold mb-2">Personal Data Processing Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Comprehensive Personal Data Processing Policy — Habeas Data — TAPEE
      </p>
      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">I. Legal Framework and Guiding Principles</h2>
          <p className="text-muted-foreground leading-relaxed">
            This Personal Data Processing Policy is grounded in the Political Constitution of Colombia (Art. 15), Law 1581 of 2012, Decree 1377 of 2013, and Ruling C-748 of 2011. TAPEE is committed to rigorously applying the principles of legality, purpose limitation, freedom, accuracy, transparency, restricted access and circulation, security, and confidentiality in the handling of information.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">II. Identity and Registered Address of the Data Controller</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Controller:</span> TAPEE S.A.S. (hereinafter "TAPEE" or the "Controller").</li>
            <li><span className="font-medium text-foreground">Tax ID:</span> 902064713-1</li>
            <li><span className="font-medium text-foreground">Registered Address:</span> Medellín, Antioquia, Colombia.</li>
            <li><span className="font-medium text-foreground">Contact Channel:</span> Email <a href="mailto:hola@tapee.app" className="text-primary hover:underline">hola@tapee.app</a> for inquiries, petitions, complaints, and claims (PQR) related to data processing.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">III. Legal and Technical Definitions</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Authorization:</span> Prior, express, and informed consent of the Data Subject.</li>
            <li><span className="font-medium text-foreground">Database:</span> Organized set of personal data subject to Processing.</li>
            <li><span className="font-medium text-foreground">Data Processor:</span> A person who processes data on behalf of the Controller.</li>
            <li><span className="font-medium text-foreground">Sensitive Data:</span> Data that affects the privacy of the Data Subject or whose misuse may result in discrimination (e.g., biometrics at events).</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">IV. Data Categories and Collection Methods</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE collects data through its digital interfaces, registration forms, NFC reader devices, and direct communications. Categories include:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Personal Identification Data:</span> First and last names, ID number, gender, age, and profile photo (optional).</li>
            <li><span className="font-medium text-foreground">Contact Data:</span> Email addresses, mobile phone numbers, social media profiles, and billing addresses.</li>
            <li><span className="font-medium text-foreground">Traffic and Browsing Data:</span> IP addresses, session identifiers, browser types, operating systems, log records, network-node-based geolocation, and in-app behavioral patterns.</li>
            <li><span className="font-medium text-foreground">NFC Proximity Technical Data:</span> Linked device identifiers (chip UIDs), entry and exit timestamps, checkpoint validation history, and cashless spending records where applicable.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">V. Processing Purposes (Authorized Uses)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            By accepting this policy, the Data Subject expressly authorizes TAPEE to process their data for the following purposes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Service Operation:</span> Management of pre-sales, sales, reservations, issuance of digital tickets, and physical delivery of NFC devices.</li>
            <li><span className="font-medium text-foreground">Security and Risk Prevention:</span> Identity verification to mitigate fraud in electronic transactions and prevent identity theft at event access points.</li>
            <li><span className="font-medium text-foreground">Technical Support and PQR:</span> Addressing technical inquiries about platform functionality or NFC device integrity.</li>
            <li><span className="font-medium text-foreground">Event Organizer Relationship:</span> Transferring attendance data to the Event Organizer for attendee insurance policies, capacity control, and emergency logistics.</li>
            <li><span className="font-medium text-foreground">Marketing and Loyalty:</span> Sending advertising information, newsletters, commercial offers, and satisfaction surveys. The Data Subject may revoke this purpose at any time.</li>
            <li><span className="font-medium text-foreground">Aggregate Analytics:</span> Conducting statistical studies on attendance trends, peak entry times, and heat maps at events to improve public safety.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VI. Rights of Data Subjects (Art. 8, Law 1581)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Access:</span> Free access to personal data that has been processed.</li>
            <li><span className="font-medium text-foreground">Update and Rectification:</span> Request correction of partial, inaccurate, incomplete, or misleading data.</li>
            <li><span className="font-medium text-foreground">Proof of Authorization:</span> Request proof of the authorization granted to the Controller.</li>
            <li><span className="font-medium text-foreground">Revocation and Deletion:</span> Request deletion of data or revoke authorization when legal principles are not respected, following a complaint to the Superintendence of Industry and Commerce (SIC).</li>
            <li><span className="font-medium text-foreground">Information:</span> Be informed of how personal data has been used.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VII. Security and Confidentiality Protocols</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            TAPEE declares that it has physical, technical, and administrative security measures in place to prevent unauthorized access. These include:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>End-to-end encryption protocols for data transmission.</li>
            <li>Redundant servers and cloud storage under international standards (SOC 2 / ISO 27001).</li>
            <li>Restricted database access limited to authorized personnel under strict confidentiality agreements.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">VIII. Effective Date and Amendments</h2>
          <p className="text-muted-foreground leading-relaxed">
            This policy takes effect on the date of its publication. TAPEE reserves the right to modify it at any time to adapt to legislative or technological changes. Any substantial change will be communicated through the registered contact channels.
          </p>
        </section>
      </div>
    </>
  );
}

export default function Privacy() {
  const { i18n } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {i18n.language === "en" ? <PrivacyEn /> : <PrivacyEs />}
    </div>
  );
}

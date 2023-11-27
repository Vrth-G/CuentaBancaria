using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace CuentaBancaria.Clases
{
    public class Transaccion
    {
        public static int ContadorTransaccion = 0;
        private string _Codigo;
        private string _Descripcion;
        private DateTime _Fecha;
        private double _Monto;

        public double Monto
        {
            get { return _Monto; }
            set { _Monto = value; }
        }

        public DateTime Fecha
        {
            get { return _Fecha; }
            set { _Fecha = value; }
        }

        public string Descripcion
        {
            get { return _Descripcion; }
            set { _Descripcion = value; }
        }

        public string Codigo
        {
            get { return _Codigo; }
            set { _Codigo = value; }
        }

        public Transaccion()
        {
        }

        public Transaccion(string codigo, string descripcion, DateTime fecha, double monto)
        {
            _Codigo = codigo;
            _Descripcion = descripcion;
            _Fecha = fecha;
            _Monto = monto;
            ContadorTransaccion++;
        }
        public void MostrarTransaccion(string Codigo)
        {
            if (_Codigo == Codigo)
            {
                Console.WriteLine(" Codigo: " + Codigo);
                Console.WriteLine(" Descripcion: " + Descripcion);
                Console.WriteLine(" Fecha: " + Fecha);
                Console.WriteLine("Monto: " + Monto);
            }
            else
                Console.WriteLine("No se encontro esa transaccion");
        }
    }
}
